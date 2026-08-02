import { Role } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { AppError } from '../lib/errors';
import { round2 } from '../lib/grading';
import { ah, parseQuery } from '../lib/helpers';
import { prisma } from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';

export const analyticsRouter = Router();
analyticsRouter.use(authenticate);

// GET /api/analytics/dashboard — headline numbers + charts for the landing page
analyticsRouter.get(
  '/dashboard',
  authorize(Role.ADMIN, Role.TEACHER),
  ah(async (_req, res) => {
    const activeSemester = await prisma.semester.findFirst({
      where: { isCurrent: true },
      include: { academicYear: true },
    });

    const [students, teachers, classes, subjects] = await Promise.all([
      prisma.studentProfile.count(),
      prisma.teacherProfile.count(),
      prisma.classRoom.count(),
      prisma.subject.count(),
    ]);

    let averagePerformance: number | null = null;
    let distribution: { letter: string; count: number }[] = [];
    let topStudents: unknown[] = [];
    let bottomStudents: unknown[] = [];
    let recentResults: unknown[] = [];
    let pendingSubmissions = 0;

    if (activeSemester) {
      const [agg, dist] = await Promise.all([
        prisma.subjectResult.aggregate({
          where: { semesterId: activeSemester.id, isPublished: true },
          _avg: { percentage: true },
        }),
        prisma.subjectResult.groupBy({
          by: ['letterGrade'],
          where: { semesterId: activeSemester.id, isPublished: true },
          _count: { letterGrade: true },
        }),
      ]);
      averagePerformance = agg._avg.percentage === null ? null : round2(agg._avg.percentage);
      distribution = dist
        .map((d) => ({ letter: d.letterGrade, count: d._count.letterGrade }))
        .sort((a, b) => a.letter.localeCompare(b.letter));

      // Pending approvals = distinct class×subject grids containing SUBMITTED marks
      const submittedEntries = await prisma.gradeEntry.findMany({
        where: { semesterId: activeSemester.id, status: 'SUBMITTED' },
        select: { subjectId: true, student: { select: { classId: true } } },
      });
      pendingSubmissions = new Set(
        submittedEntries.map((e) => `${e.subjectId}:${e.student.classId}`),
      ).size;

      const studentCard = {
        student: {
          include: {
            user: { select: { name: true } },
            classRoom: { select: { name: true, stream: true } },
          },
        },
      } as const;

      const [top, bottom] = await Promise.all([
        prisma.gPARecord.findMany({
          where: { semesterId: activeSemester.id, isPublished: true },
          orderBy: { gpa: 'desc' },
          take: 5,
          include: studentCard,
        }),
        prisma.gPARecord.findMany({
          where: { semesterId: activeSemester.id, isPublished: true },
          orderBy: { gpa: 'asc' },
          take: 5,
          include: studentCard,
        }),
      ]);
      const shape = (r: (typeof top)[number]) => ({
        studentId: r.studentId,
        name: r.student.user.name,
        className: r.student.classRoom
          ? `${r.student.classRoom.name} ${r.student.classRoom.stream}`
          : '—',
        gpa: r.gpa,
        average: r.average,
        position: r.position,
      });
      topStudents = top.map(shape);
      bottomStudents = bottom.map(shape);

      recentResults = (
        await prisma.subjectResult.findMany({
          where: { semesterId: activeSemester.id, isPublished: true },
          orderBy: { computedAt: 'desc' },
          take: 8,
          include: {
            student: { include: { user: { select: { name: true } } } },
            subject: { select: { code: true, name: true } },
          },
        })
      ).map((r) => ({
        id: r.id,
        student: r.student.user.name,
        subject: r.subject.name,
        percentage: r.percentage,
        letterGrade: r.letterGrade,
        computedAt: r.computedAt,
      }));
    }

    // School-wide GPA trend across past terms
    const semesters = await prisma.semester.findMany({
      orderBy: { startDate: 'asc' },
      take: 12,
      include: { academicYear: { select: { name: true } } },
    });
    const gpaTrend = await Promise.all(
      semesters.map(async (s) => {
        const agg = await prisma.gPARecord.aggregate({
          where: { semesterId: s.id, isPublished: true },
          _avg: { gpa: true },
        });
        return {
          semester: s.name,
          year: s.academicYear.name,
          average: agg._avg.gpa === null ? null : round2(agg._avg.gpa),
        };
      }),
    );

    res.json({
      activeSemester,
      counts: { students, teachers, classes, subjects },
      averagePerformance,
      pendingSubmissions,
      distribution,
      topStudents,
      bottomStudents,
      recentResults,
      gpaTrend: gpaTrend.filter((t) => t.average !== null),
    });
  }),
);

// GET /api/analytics/subject-performance?classId&semesterId
analyticsRouter.get(
  '/subject-performance',
  authorize(Role.ADMIN, Role.TEACHER),
  ah(async (req, res) => {
    const { classId, semesterId } = parseQuery(
      z.object({ classId: z.string(), semesterId: z.string() }),
      req,
    );

    const enrollments = await prisma.enrollment.findMany({
      where: { classId, semesterId },
      select: { studentId: true },
    });
    const studentIds = enrollments.map((e) => e.studentId);
    const results = await prisma.subjectResult.findMany({
      where: { semesterId, studentId: { in: studentIds }, isPublished: true },
      include: { subject: { select: { code: true, name: true } } },
    });

    const bySubject = new Map<string, { code: string; name: string; values: number[] }>();
    for (const r of results) {
      if (!bySubject.has(r.subjectId))
        bySubject.set(r.subjectId, { code: r.subject.code, name: r.subject.name, values: [] });
      bySubject.get(r.subjectId)!.values.push(r.percentage);
    }

    const data = [...bySubject.entries()]
      .map(([subjectId, s]) => ({
        subjectId,
        code: s.code,
        name: s.name,
        average: round2(s.values.reduce((a, v) => a + v, 0) / s.values.length),
        highest: Math.max(...s.values),
        lowest: Math.min(...s.values),
        entries: s.values.length,
      }))
      .sort((a, b) => b.average - a.average);

    res.json({ data });
  }),
);

// GET /api/analytics/gpa-trends?studentId — progress line across terms
analyticsRouter.get(
  '/gpa-trends',
  ah(async (req, res) => {
    const { studentId } = parseQuery(z.object({ studentId: z.string() }), req);

    const student = await prisma.studentProfile.findUnique({
      where: { id: studentId },
      select: { userId: true, parent: { select: { userId: true } } },
    });
    if (!student) throw AppError.notFound('Student');
    const me = req.user!;
    const allowed =
      me.role === Role.ADMIN ||
      me.role === Role.TEACHER ||
      student.userId === me.id ||
      student.parent?.userId === me.id;
    if (!allowed) throw AppError.forbidden();

    const records = await prisma.gPARecord.findMany({
      where: { studentId, isPublished: true },
      include: { semester: { include: { academicYear: { select: { name: true } } } } },
      orderBy: { semester: { startDate: 'asc' } },
    });
    res.json({
      points: records.map((r) => ({
        semester: r.semester.name,
        year: r.semester.academicYear.name,
        gpa: r.gpa,
        average: r.average,
        position: r.position,
      })),
    });
  }),
);

// GET /api/analytics/class-performance?semesterId
analyticsRouter.get(
  '/class-performance',
  authorize(Role.ADMIN, Role.TEACHER),
  ah(async (req, res) => {
    const { semesterId } = parseQuery(z.object({ semesterId: z.string() }), req);
    const enrollments = await prisma.enrollment.findMany({
      where: { semesterId },
      include: { classRoom: { select: { id: true, name: true, stream: true } } },
    });
    const classIds = [...new Map(enrollments.map((e) => [e.classId, e.classRoom])).entries()];

    const data = await Promise.all(
      classIds.map(async ([classId, classRoom]) => {
        const ids = enrollments.filter((e) => e.classId === classId).map((e) => e.studentId);
        const agg = await prisma.gPARecord.aggregate({
          where: { semesterId, studentId: { in: ids }, isPublished: true },
          _avg: { gpa: true, average: true },
        });
        return {
          classId,
          name: `${classRoom.name} ${classRoom.stream}`,
          students: ids.length,
          averageGpa: agg._avg.gpa === null ? null : round2(agg._avg.gpa),
          averageScore: agg._avg.average === null ? null : round2(agg._avg.average),
        };
      }),
    );
    res.json({ data: data.sort((a, b) => (b.averageGpa ?? 0) - (a.averageGpa ?? 0)) });
  }),
);
