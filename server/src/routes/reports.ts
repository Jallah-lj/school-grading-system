import { Role } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { AppError } from '../lib/errors';
import { ah, parseQuery, toCsv } from '../lib/helpers';
import { prisma } from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';
import { ensureEnrollments } from '../services/results.service';

export const reportsRouter = Router();
reportsRouter.use(authenticate);

function sendCsv(res: import('express').Response, filename: string, csv: string) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + csv); // BOM → opens cleanly in Excel
}

// GET /api/reports/gradesheet.csv?classId&subjectId&semesterId
reportsRouter.get(
  '/gradesheet.csv',
  authorize(Role.TEACHER, Role.ADMIN),
  ah(async (req, res) => {
    const { classId, subjectId, semesterId } = parseQuery(
      z.object({ classId: z.string(), subjectId: z.string(), semesterId: z.string() }),
      req,
    );

    if (req.user!.role !== Role.ADMIN) {
      const assigned = await prisma.teacherAssignment.findFirst({
        where: { classId, subjectId, teacher: { userId: req.user!.id } },
      });
      if (!assigned)
        throw AppError.forbidden('You are not assigned to this subject for this class');
    }

    await ensureEnrollments(classId, semesterId);
    const enrollments = await prisma.enrollment.findMany({
      where: { classId, semesterId },
      include: { student: { include: { user: { select: { name: true } } } } },
      orderBy: { student: { user: { name: 'asc' } } },
    });
    const studentIds = enrollments.map((e) => e.studentId);
    const [components, entries, results, subject, classRoom, semester] = await Promise.all([
      prisma.assessmentComponent.findMany({ where: { subjectId }, orderBy: { type: 'asc' } }),
      prisma.gradeEntry.findMany({
        where: { subjectId, semesterId, studentId: { in: studentIds } },
        select: { studentId: true, componentId: true, score: true },
      }),
      prisma.subjectResult.findMany({
        where: { subjectId, semesterId, studentId: { in: studentIds } },
      }),
      prisma.subject.findUnique({ where: { id: subjectId } }),
      prisma.classRoom.findUnique({ where: { id: classId } }),
      prisma.semester.findUnique({ where: { id: semesterId }, include: { academicYear: true } }),
    ]);

    const resultByStudent = new Map(results.map((r) => [r.studentId, r]));
    const scoreMap = new Map(entries.map((e) => [`${e.studentId}:${e.componentId}`, e.score]));

    const header = [
      'Admission No',
      'Student',
      ...components.map((c) => `${c.name} (/${c.maxScore})`),
      'Total %',
      'Grade',
      'Rank',
      'Remark',
    ];
    const rows = enrollments.map((en) => {
      const r = resultByStudent.get(en.studentId);
      return [
        en.student.admissionNumber,
        en.student.user.name,
        ...components.map((c) => scoreMap.get(`${en.studentId}:${c.id}`) ?? ''),
        r ? r.percentage.toFixed(1) : '',
        r?.letterGrade ?? '',
        r?.position ?? '',
        r?.remark ?? '',
      ];
    });

    const filename =
      `gradesheet_${subject?.code}_${classRoom?.name}_${semester?.name}`.replace(/\s+/g, '_') +
      '.csv';
    const meta = [
      ['Subject', subject?.name ?? ''],
      ['Class', classRoom ? `${classRoom.name} ${classRoom.stream}` : ''],
      ['Term', semester ? `${semester.name} — ${semester.academicYear.name}` : ''],
      [],
    ];
    sendCsv(res, filename, toCsv([...meta, header, ...rows]));
  }),
);

// GET /api/reports/class-report.csv?classId&semesterId — GPA report for a class
reportsRouter.get(
  '/class-report.csv',
  authorize(Role.TEACHER, Role.ADMIN),
  ah(async (req, res) => {
    const { classId, semesterId } = parseQuery(
      z.object({ classId: z.string(), semesterId: z.string() }),
      req,
    );
    await ensureEnrollments(classId, semesterId);

    const enrollments = await prisma.enrollment.findMany({
      where: { classId, semesterId },
      include: { student: { include: { user: { select: { name: true } } } } },
      orderBy: { student: { user: { name: 'asc' } } },
    });
    const [subjects, classRoom, semester] = await Promise.all([
      prisma.subject.findMany({ orderBy: { code: 'asc' } }),
      prisma.classRoom.findUnique({ where: { id: classId } }),
      prisma.semester.findUnique({ where: { id: semesterId }, include: { academicYear: true } }),
    ]);

    const rows = await Promise.all(
      enrollments.map(async (en) => {
        const [results, gpa] = await Promise.all([
          prisma.subjectResult.findMany({ where: { studentId: en.studentId, semesterId } }),
          prisma.gPARecord.findUnique({
            where: { studentId_semesterId: { studentId: en.studentId, semesterId } },
          }),
        ]);
        const bySubject = new Map(results.map((r) => [r.subjectId, r]));
        return [
          en.student.admissionNumber,
          en.student.user.name,
          ...subjects.map((s) => bySubject.get(s.id)?.percentage ?? ''),
          gpa ? gpa.average.toFixed(1) : '',
          gpa ? gpa.gpa.toFixed(2) : '',
          gpa?.position ?? '',
        ];
      }),
    );

    const header = [
      'Admission No',
      'Student',
      ...subjects.map((s) => s.code),
      'Average',
      'GPA',
      'Position',
    ];
    const filename =
      `class_report_${classRoom?.name}_${semester?.name}`.replace(/\s+/g, '_') + '.csv';
    const meta = [
      ['Class Performance Report'],
      ['Class', classRoom ? `${classRoom.name} ${classRoom.stream}` : ''],
      ['Term', semester ? `${semester.name} — ${semester.academicYear.name}` : ''],
      [],
    ];
    sendCsv(res, filename, toCsv([...meta, header, ...rows]));
  }),
);
