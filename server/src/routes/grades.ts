import { GradeStatus, Prisma, Role } from '@prisma/client';
import ExcelJS from 'exceljs';
import { Router } from 'express';
import { z } from 'zod';

import { logAudit } from '../lib/audit';
import { AppError } from '../lib/errors';
import { ah, parseBody, parseQuery } from '../lib/helpers';
import { prisma } from '../lib/prisma';
import { parseSpreadsheetFile, spreadsheetUpload } from '../lib/spreadsheet';
import { authenticate, authorize } from '../middleware/auth';
import { notifyUsers, studentAudienceUserIds, ExtendedNotificationService } from '../services/notify';
import {
  ensureEnrollments,
  recomputeGpas,
  recomputeSubjectResults,
} from '../services/results.service';

export const gradesRouter = Router();
gradesRouter.use(authenticate);

const scopeSchema = z.object({
  classId: z.string(),
  subjectId: z.string(),
  semesterId: z.string(),
});

/** Teachers may only touch (class, subject) pairs they are assigned to. Admins bypass. */
async function assertTeacherScope(
  user: Express.Request['user'],
  classId: string,
  subjectId: string,
) {
  if (user!.role === Role.ADMIN) return;
  const assignment = await prisma.teacherAssignment.findFirst({
    where: { classId, subjectId, teacher: { userId: user!.id } },
  });
  if (!assignment) throw AppError.forbidden('You are not assigned to this subject for this class');
}

const STATUS_ORDER: GradeStatus[] = ['DRAFT', 'SUBMITTED', 'APPROVED', 'PUBLISHED'];

async function buildGrid(classId: string, subjectId: string, semesterId: string, isAdmin: boolean) {
  await ensureEnrollments(classId, semesterId);

  const [enrollments, components, entries] = await Promise.all([
    prisma.enrollment.findMany({
      where: { classId, semesterId },
      include: { student: { include: { user: { select: { name: true } } } } },
      orderBy: { student: { user: { name: 'asc' } } },
    }),
    prisma.assessmentComponent.findMany({ where: { subjectId } }),
    prisma.gradeEntry.findMany({
      where: { subjectId, semesterId, student: { classId } },
      select: { studentId: true, componentId: true, score: true, status: true },
    }),
  ]);

  const typeOrder = ['ASSIGNMENT', 'QUIZ', 'CAT', 'PRACTICAL', 'MIDTERM', 'PROJECT', 'FINAL'];
  components.sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type));

  const gridEntries: Record<string, Record<string, { score: number; status: GradeStatus }>> = {};
  let lowest: GradeStatus | null = null;
  for (const e of entries) {
    (gridEntries[e.studentId] ??= {})[e.componentId] = { score: e.score, status: e.status };
    if (!lowest || STATUS_ORDER.indexOf(e.status) < STATUS_ORDER.indexOf(lowest)) lowest = e.status;
  }

  return {
    students: enrollments.map((en) => ({
      id: en.studentId,
      name: en.student.user.name,
      admissionNumber: en.student.admissionNumber,
    })),
    components: components.map((c) => ({
      id: c.id,
      type: c.type,
      name: c.name,
      weight: c.weight,
      maxScore: c.maxScore,
    })),
    entries: gridEntries,
    status: lowest ?? 'EMPTY',
    editable: isAdmin
      ? lowest !== 'PUBLISHED'
      : lowest === null || lowest === 'DRAFT' || lowest === 'SUBMITTED',
  };
}

// GET /api/grades/grid?classId&subjectId&semesterId — the teacher's mark-entry matrix
gradesRouter.get(
  '/grid',
  authorize(Role.TEACHER, Role.ADMIN),
  ah(async (req, res) => {
    const { classId, subjectId, semesterId } = parseQuery(scopeSchema, req);
    await assertTeacherScope(req.user, classId, subjectId);
    res.json(await buildGrid(classId, subjectId, semesterId, req.user!.role === Role.ADMIN));
  }),
);

const entrySchema = scopeSchema.extend({
  entries: z
    .array(
      z.object({
        studentId: z.string(),
        scores: z.record(z.string(), z.number().min(0).nullable()),
      }),
    )
    .min(1),
});

// POST /api/grades/entry — bulk upsert of marks (editable until approval)
gradesRouter.post(
  '/entry',
  authorize(Role.TEACHER, Role.ADMIN),
  ah(async (req, res) => {
    const body = parseBody(entrySchema, req);
    await assertTeacherScope(req.user, body.classId, body.subjectId);
    await ensureEnrollments(body.classId, body.semesterId);

    const components = await prisma.assessmentComponent.findMany({
      where: { subjectId: body.subjectId },
    });
    const componentById = new Map(components.map((c) => [c.id, c]));

    const teacherProfile = await prisma.teacherProfile.findFirst({
      where: { userId: req.user!.id },
      select: { id: true },
    });

    const studentIds = body.entries.map((e) => e.studentId);
    const existing = await prisma.gradeEntry.findMany({
      where: {
        subjectId: body.subjectId,
        semesterId: body.semesterId,
        studentId: { in: studentIds },
      },
      select: { studentId: true, componentId: true, score: true, status: true },
    });
    const existingByKey = new Map(existing.map((e) => [`${e.studentId}:${e.componentId}`, e]));
    const operations: Prisma.PrismaPromise<unknown>[] = [];
    let changedApproved = false;

    for (const row of body.entries) {
      for (const [componentId, score] of Object.entries(row.scores)) {
        const component = componentById.get(componentId);
        if (!component) throw AppError.badRequest(`Unknown component ${componentId}`);
        const key = `${row.studentId}:${componentId}`;
        const current = existingByKey.get(key);
        const status = current?.status;

        // Marks are locked once published; teachers also cannot touch approved marks.
        if (status === 'PUBLISHED')
          throw AppError.conflict(
            'Marks are published. Ask an administrator to unlock them first.',
          );
        if (status === 'APPROVED' && req.user!.role !== Role.ADMIN) {
          throw AppError.conflict(
            'Marks have been approved and can no longer be edited by teachers.',
          );
        }

        if (score === null) {
          // Do not issue no-op deletes for every empty grid cell.
          if (current && (status !== 'APPROVED' || req.user!.role === Role.ADMIN)) {
            changedApproved ||= status === 'APPROVED';
            operations.push(
              prisma.gradeEntry.deleteMany({
                where: { studentId: row.studentId, componentId, semesterId: body.semesterId },
              }),
            );
          }
          continue;
        }
        if (score > component.maxScore) {
          throw AppError.badRequest(
            `Score ${score} exceeds max (${component.maxScore}) for ${component.name}`,
          );
        }
        // Auto-save posts the visible grid. Skip cells that have not changed so a
        // single edit does not turn into dozens of remote database round trips.
        if (current?.score === score) continue;

        changedApproved ||= status === 'APPROVED';
        const nextStatus =
          status === 'APPROVED' && req.user!.role === Role.ADMIN ? 'APPROVED' : 'DRAFT';
        operations.push(
          prisma.gradeEntry.upsert({
            where: {
              studentId_componentId_semesterId: {
                studentId: row.studentId,
                componentId,
                semesterId: body.semesterId,
              },
            },
            create: {
              studentId: row.studentId,
              componentId,
              subjectId: body.subjectId,
              semesterId: body.semesterId,
              score,
              enteredById: teacherProfile?.id ?? null,
              // Admin edits on approved marks keep APPROVED so recomputation stays valid.
              status: nextStatus,
            },
            update: {
              score,
              enteredById: teacherProfile?.id ?? undefined,
              status: nextStatus,
            },
          }),
        );
      }
    }

    // A batch transaction avoids holding an interactive transaction open while
    // each cell makes a separate round trip to a remote Supabase pooler.
    if (operations.length > 0) await prisma.$transaction(operations);

    // If an admin edited approved marks, recompute immediately so results stay in sync.
    if (changedApproved && req.user!.role === Role.ADMIN) {
      await recomputeSubjectResults(body.classId, body.subjectId, body.semesterId);
      await recomputeGpas(body.classId, body.semesterId);
    }

    await logAudit(req, 'ENTER_GRADES', 'GradeEntry', undefined, {
      classId: body.classId,
      subjectId: body.subjectId,
      semesterId: body.semesterId,
      students: body.entries.length,
    });
    res.json(
      await buildGrid(body.classId, body.subjectId, body.semesterId, req.user!.role === Role.ADMIN),
    );
  }),
);

// POST /api/grades/submit — teacher submits DRAFT marks for approval
gradesRouter.post(
  '/submit',
  authorize(Role.TEACHER, Role.ADMIN),
  ah(async (req, res) => {
    const body = parseBody(scopeSchema, req);
    await assertTeacherScope(req.user, body.classId, body.subjectId);

    const result = await prisma.gradeEntry.updateMany({
      where: {
        subjectId: body.subjectId,
        semesterId: body.semesterId,
        student: { classId: body.classId },
        status: 'DRAFT',
      },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });

    const [subject, classRoom] = await Promise.all([
      prisma.subject.findUnique({
        where: { id: body.subjectId },
        select: { name: true, code: true },
      }),
      prisma.classRoom.findUnique({
        where: { id: body.classId },
        select: { name: true, stream: true },
      }),
    ]);
    const label =
      `${classRoom?.name ?? ''} ${classRoom?.stream ?? ''} — ${subject?.name ?? ''} (${subject?.code ?? ''})`
        .replace(/\s+/g, ' ')
        .trim();

    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', isActive: true },
      select: { id: true },
    });
    await notifyUsers(
      admins.map((a) => a.id),
      'ANNOUNCEMENT',
      'Grades awaiting approval',
      `${req.user!.name} submitted ${result.count} marks for ${label}. Tap to review and approve.`,
      '/approvals',
    );

    await logAudit(req, 'SUBMIT_GRADES', 'GradeEntry', undefined, { ...body, count: result.count });
    res.json({
      submitted: result.count,
      grid: await buildGrid(
        body.classId,
        body.subjectId,
        body.semesterId,
        req.user!.role === Role.ADMIN,
      ),
    });
  }),
);

// GET /api/grades/pending-approvals — the administrator's approval inbox:
// one row per (class, subject, term) grid with SUBMITTED marks, oldest first.
gradesRouter.get(
  '/pending-approvals',
  authorize(Role.ADMIN),
  ah(async (_req, res) => {
    const entries = await prisma.gradeEntry.findMany({
      where: { status: 'SUBMITTED' },
      select: {
        studentId: true,
        subjectId: true,
        semesterId: true,
        submittedAt: true,
        student: { select: { classId: true } },
      },
    });

    interface Group {
      classId: string;
      subjectId: string;
      semesterId: string;
      marks: number;
      students: Set<string>;
      submittedAt: Date | null;
    }
    const groups = new Map<string, Group>();
    for (const e of entries) {
      const classId = e.student.classId;
      if (!classId) continue;
      const key = `${classId}:${e.subjectId}:${e.semesterId}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          classId,
          subjectId: e.subjectId,
          semesterId: e.semesterId,
          marks: 0,
          students: new Set(),
          submittedAt: null,
        };
        groups.set(key, g);
      }
      g.marks += 1;
      g.students.add(e.studentId);
      if (e.submittedAt && (!g.submittedAt || e.submittedAt < g.submittedAt))
        g.submittedAt = e.submittedAt;
    }

    const rows = [...groups.values()];
    const classIds = [...new Set(rows.map((g) => g.classId))];
    const subjectIds = [...new Set(rows.map((g) => g.subjectId))];
    const semesterIds = [...new Set(rows.map((g) => g.semesterId))];

    const [classes, subjects, semesters, assignments] = await Promise.all([
      prisma.classRoom.findMany({
        where: { id: { in: classIds } },
        select: { id: true, name: true, stream: true },
      }),
      prisma.subject.findMany({
        where: { id: { in: subjectIds } },
        select: { id: true, name: true, code: true },
      }),
      prisma.semester.findMany({
        where: { id: { in: semesterIds } },
        include: { academicYear: { select: { name: true } } },
      }),
      prisma.teacherAssignment.findMany({
        where: { classId: { in: classIds }, subjectId: { in: subjectIds } },
        include: { teacher: { include: { user: { select: { name: true } } } } },
      }),
    ]);

    const classById = new Map(classes.map((c) => [c.id, c]));
    const subjectById = new Map(subjects.map((s) => [s.id, s]));
    const semesterById = new Map(semesters.map((s) => [s.id, s]));
    const teachersByPair = new Map<string, string[]>();
    for (const a of assignments) {
      const key = `${a.classId}:${a.subjectId}`;
      const list = teachersByPair.get(key) ?? [];
      if (!list.includes(a.teacher.user.name)) list.push(a.teacher.user.name);
      teachersByPair.set(key, list);
    }

    const data = rows
      .map((g) => {
        const cls = classById.get(g.classId);
        const subject = subjectById.get(g.subjectId);
        const semester = semesterById.get(g.semesterId);
        return {
          classId: g.classId,
          className: cls?.name ?? '—',
          stream: cls?.stream ?? '',
          subjectId: g.subjectId,
          subjectName: subject?.name ?? '—',
          subjectCode: subject?.code ?? '',
          semesterId: g.semesterId,
          semesterName: semester?.name ?? '—',
          academicYearName: semester?.academicYear.name ?? '',
          marks: g.marks,
          students: g.students.size,
          teachers: teachersByPair.get(`${g.classId}:${g.subjectId}`) ?? [],
          submittedAt: g.submittedAt,
        };
      })
      .sort((a, b) => (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0));

    res.json({ data });
  }),
);

// POST /api/grades/approve — admin approves → automatic result + GPA computation
gradesRouter.post(
  '/approve',
  authorize(Role.ADMIN),
  ah(async (req, res) => {
    const body = parseBody(scopeSchema, req);

    const submitted = await prisma.gradeEntry.count({
      where: {
        subjectId: body.subjectId,
        semesterId: body.semesterId,
        student: { classId: body.classId },
        status: 'SUBMITTED',
      },
    });
    if (submitted === 0) throw AppError.badRequest('There are no submitted marks to approve');

    await prisma.gradeEntry.updateMany({
      where: {
        subjectId: body.subjectId,
        semesterId: body.semesterId,
        student: { classId: body.classId },
        status: 'SUBMITTED',
      },
      data: { status: 'APPROVED', approvedAt: new Date(), approvedById: req.user!.id },
    });

    const { computed } = await recomputeSubjectResults(
      body.classId,
      body.subjectId,
      body.semesterId,
    );
    await recomputeGpas(body.classId, body.semesterId);

    await logAudit(req, 'APPROVE_GRADES', 'GradeEntry', undefined, { ...body, computed });
    res.json({ approved: submitted, resultsComputed: computed });
  }),
);

async function subjectMeta(subjectId: string) {
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { name: true, code: true },
  });
  return `${subject?.name ?? 'subject'} (${subject?.code ?? ''})`.trim();
}

// POST /api/grades/publish — admin publishes → visible to students/parents + notifications
gradesRouter.post(
  '/publish',
  authorize(Role.ADMIN),
  ah(async (req, res) => {
    const body = parseBody(scopeSchema, req);

    const enrollments = await prisma.enrollment.findMany({
      where: { classId: body.classId, semesterId: body.semesterId },
      select: { studentId: true },
    });
    const studentIds = enrollments.map((e) => e.studentId);

    const approved = await prisma.gradeEntry.count({
      where: {
        subjectId: body.subjectId,
        semesterId: body.semesterId,
        studentId: { in: studentIds },
        status: 'APPROVED',
      },
    });
    if (approved === 0) throw AppError.badRequest('There are no approved marks to publish');

    await prisma.$transaction([
      prisma.gradeEntry.updateMany({
        where: {
          subjectId: body.subjectId,
          semesterId: body.semesterId,
          studentId: { in: studentIds },
          status: 'APPROVED',
        },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      }),
      prisma.subjectResult.updateMany({
        where: {
          subjectId: body.subjectId,
          semesterId: body.semesterId,
          studentId: { in: studentIds },
        },
        data: { isPublished: true },
      }),
      prisma.gPARecord.updateMany({
        where: { semesterId: body.semesterId, studentId: { in: studentIds } },
        data: { isPublished: true },
      }),
    ]);

    const audience = await studentAudienceUserIds(studentIds);
    const subject = await subjectMeta(body.subjectId);
    await notifyUsers(
      audience,
      'GRADES_PUBLISHED',
      'Grades published',
      `Results for ${subject} have been published. Check your report card for details.`,
      '/grades',
    );

    // Send external email notifications
    const extService = new ExtendedNotificationService();
    const { emailSent, smsSent } = await extService.notifyExternal(
      audience,
      'GRADES_PUBLISHED',
      'Grades published',
      `Results for ${subject} have been published. Check your grades at /grades`,
      '/grades',
      true, // includeEmail
      false, // includeSMS by default (optional)
    );

    await logAudit(req, 'PUBLISH_GRADES', 'GradeEntry', undefined, {
      ...body,
      published: approved,
      notifiedInApp: audience.length,
      notifiedEmail: emailSent,
      notifiedSMS: smsSent,
    });
    res.json({ published: approved, notified: audience.length, notifiedEmail: emailSent, notifiedSMS: smsSent });
  }),
);

// POST /api/grades/unlock — reopen marks for corrections, or return a
// submission to the teacher (to=DRAFT sends SUBMITTED marks back for changes).
gradesRouter.post(
  '/unlock',
  authorize(Role.ADMIN),
  ah(async (req, res) => {
    const body = parseBody(
      scopeSchema.extend({
        to: z.enum(['APPROVED', 'SUBMITTED', 'DRAFT']).default('SUBMITTED'),
        note: z.string().max(500).optional(),
      }),
      req,
    );
    const fromMap: Record<'APPROVED' | 'SUBMITTED' | 'DRAFT', GradeStatus> = {
      APPROVED: 'PUBLISHED',
      SUBMITTED: 'APPROVED',
      DRAFT: 'SUBMITTED',
    };
    const from = fromMap[body.to];

    const enrollments = await prisma.enrollment.findMany({
      where: { classId: body.classId, semesterId: body.semesterId },
      select: { studentId: true },
    });
    const studentIds = enrollments.map((e) => e.studentId);

    const updated = await prisma.gradeEntry.updateMany({
      where: {
        subjectId: body.subjectId,
        semesterId: body.semesterId,
        studentId: { in: studentIds },
        status: from,
      },
      data: { status: body.to, publishedAt: null },
    });
    if (from === 'PUBLISHED') {
      await prisma.subjectResult.updateMany({
        where: {
          subjectId: body.subjectId,
          semesterId: body.semesterId,
          studentId: { in: studentIds },
        },
        data: { isPublished: false },
      });
    }

    const returning = body.to === 'DRAFT';
    const subject = await subjectMeta(body.subjectId);
    const teachers = await prisma.teacherAssignment.findMany({
      where: { classId: body.classId, subjectId: body.subjectId },
      include: { teacher: { include: { user: { select: { id: true } } } } },
    });
    await notifyUsers(
      teachers.map((t) => t.teacher.user.id),
      'GRADE_CORRECTION',
      returning ? 'Marks returned for correction' : 'Marks reopened for correction',
      `Marks for ${subject} were ${returning ? 'returned' : 'reopened'} for correction. ${body.note ? `Note from the administrator: ${body.note}` : 'Please review and resubmit.'}`,
      `/grade-entry?classId=${body.classId}&subjectId=${body.subjectId}&semesterId=${body.semesterId}`,
    );

    await logAudit(req, returning ? 'RETURN_GRADES' : 'UNLOCK_GRADES', 'GradeEntry', undefined, {
      ...body,
    });
    res.json({ unlocked: updated.count });
  }),
);

// GET /api/grades/class-summary?classId&semesterId — class grade sheet
gradesRouter.get(
  '/class-summary',
  authorize(Role.TEACHER, Role.ADMIN),
  ah(async (req, res) => {
    const { classId, semesterId } = parseQuery(
      z.object({ classId: z.string(), semesterId: z.string() }),
      req,
    );
    const enrollments = await prisma.enrollment.findMany({
      where: { classId, semesterId },
      include: { student: { include: { user: { select: { name: true } } } } },
      orderBy: { student: { user: { name: 'asc' } } },
    });

    const rows = await Promise.all(
      enrollments.map(async (en) => {
        const [results, gpa] = await Promise.all([
          prisma.subjectResult.findMany({
            where: { studentId: en.studentId, semesterId },
            include: { subject: { select: { code: true, name: true, creditUnits: true } } },
            orderBy: { subject: { code: 'asc' } },
          }),
          prisma.gPARecord.findUnique({
            where: { studentId_semesterId: { studentId: en.studentId, semesterId } },
          }),
        ]);
        return {
          studentId: en.studentId,
          name: en.student.user.name,
          admissionNumber: en.student.admissionNumber,
          results,
          gpa,
        };
      }),
    );
    res.json({ data: rows });
  }),
);

// === Bulk marks import (Excel / CSV) — teacher speed-up ===

const importScopeQuery = scopeSchema;

/** Shared loader for the template + import handlers. */
async function loadImportContext(classId: string, subjectId: string, semesterId: string) {
  await ensureEnrollments(classId, semesterId);
  const [classRoom, subject, semester, components, enrollments, entries] = await Promise.all([
    prisma.classRoom.findUnique({
      where: { id: classId },
      select: { id: true, name: true, stream: true },
    }),
    prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true, name: true, code: true },
    }),
    prisma.semester.findUnique({
      where: { id: semesterId },
      include: { academicYear: { select: { name: true } } },
    }),
    prisma.assessmentComponent.findMany({ where: { subjectId } }),
    prisma.enrollment.findMany({
      where: { classId, semesterId },
      include: { student: { include: { user: { select: { name: true } } } } },
      orderBy: { student: { user: { name: 'asc' } } },
    }),
    prisma.gradeEntry.findMany({
      where: { subjectId, semesterId, student: { classId } },
      select: { studentId: true, componentId: true, score: true, status: true },
    }),
  ]);
  if (!classRoom) throw AppError.notFound('Class');
  if (!subject) throw AppError.notFound('Subject');
  if (!semester) throw AppError.notFound('Term');
  const typeOrder = ['ASSIGNMENT', 'QUIZ', 'CAT', 'PRACTICAL', 'MIDTERM', 'PROJECT', 'FINAL'];
  components.sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type));
  return { classRoom, subject, semester, components, enrollments, entries };
}

/**
 * GET /api/grades/import/template?classId&subjectId&semesterId —
 * .xlsx pre-filled with the class roster (admission no + name), one column per
 * assessment component, and any marks already entered — teachers just fill it in.
 */
gradesRouter.get(
  '/import/template',
  authorize(Role.TEACHER, Role.ADMIN),
  ah(async (req, res) => {
    const { classId, subjectId, semesterId } = parseQuery(importScopeQuery, req);
    await assertTeacherScope(req.user, classId, subjectId);
    const ctx = await loadImportContext(classId, subjectId, semesterId);

    const scoreByKey = new Map(
      ctx.entries.map((e) => [`${e.studentId}:${e.componentId}`, e.score]),
    );
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Marks');
    ws.columns = [
      { header: 'admissionNumber', width: 20 },
      { header: 'name', width: 30 },
      ...ctx.components.map((c) => ({ header: c.name, width: Math.max(12, c.name.length + 2) })),
    ];
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };
    ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }];
    for (const en of ctx.enrollments) {
      ws.addRow([
        en.student.admissionNumber,
        en.student.user.name,
        ...ctx.components.map((c) => scoreByKey.get(`${en.studentId}:${c.id}`) ?? ''),
      ]);
    }

    const info = wb.addWorksheet('Info');
    [
      `Marks import for: ${ctx.classRoom.name} ${ctx.classRoom.stream} — ${ctx.subject.name} (${ctx.subject.code}) · ${ctx.semester.name} ${ctx.semester.academicYear.name}`,
      '',
      'HOW TO USE',
      '1. Type marks straight into the "Marks" sheet (one student per row, identified by admissionNumber — do not edit columns A and B).',
      '2. Leave cells BLANK to keep whatever is already in the system (blank never deletes).',
      '3. Scores must be numbers between 0 and the component max (see table below).',
      '4. Save the file and upload it on the Grade Entry page with the same class / subject / term selected.',
      '',
      'COMPONENTS',
      ...ctx.components.map((c) => `  • ${c.name} — weight ${c.weight}%, max score ${c.maxScore}`),
    ].forEach((line) => info.addRow([line]));
    info.getColumn(1).width = 120;

    const buf = await wb.xlsx.writeBuffer();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    const fname =
      `marks_${ctx.classRoom.name}_${ctx.classRoom.stream}_${ctx.subject.code}.xlsx`.replace(
        /\s+/g,
        '_',
      );
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(Buffer.from(buf as ArrayBuffer));
  }),
);

const ADMISSION_HEADERS = ['admissionnumber', 'admissionno', 'admno', 'adm', 'regno', 'regnumber'];
const normalizeCol = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

/**
 * POST /api/grades/import?classId&subjectId&semesterId — multipart { file }.
 * Applies marks from the template back into the grid. Blank cells keep existing
 * marks; invalid cells are reported per row and skipped. Same lock rules as the
 * interactive grid (published/approved marks are protected).
 */
gradesRouter.post(
  '/import',
  authorize(Role.TEACHER, Role.ADMIN),
  spreadsheetUpload.single('file'),
  ah(async (req, res) => {
    const { classId, subjectId, semesterId } = parseQuery(importScopeQuery, req);
    await assertTeacherScope(req.user, classId, subjectId);
    if (!req.file) throw AppError.badRequest('Attach an .xlsx or .csv file (max 5 MB)');
    const ctx = await loadImportContext(classId, subjectId, semesterId);
    if (ctx.components.length === 0)
      throw AppError.badRequest('This subject has no assessment components configured');
    if (ctx.enrollments.length === 0)
      throw AppError.badRequest('No students are enrolled in this class for the term');

    const rows = await parseSpreadsheetFile(req.file);
    if (rows.length === 0)
      throw AppError.badRequest('The file contains no data rows below the header');
    if (rows.length > 500) throw AppError.badRequest('Too many rows — max 500 per file');

    // Map spreadsheet columns to components (matched by exact component name).
    const compByNormName = new Map(
      ctx.components.map((c) => [c.name.toLowerCase().replace(/\s+/g, ' ').trim(), c]),
    );
    const headers = Object.keys(rows[0]);
    const admHeader = headers.find((h) => ADMISSION_HEADERS.includes(normalizeCol(h)));
    if (!admHeader)
      throw AppError.badRequest(
        'An "admissionNumber" column is required — use the downloadable template',
      );
    const compCols = new Map<string, (typeof ctx.components)[number]>();
    const unknownCols: string[] = [];
    for (const h of headers) {
      if (h === admHeader || normalizeCol(h) === 'name') continue;
      const comp = compByNormName.get(h.toLowerCase().replace(/\s+/g, ' ').trim());
      if (comp) compCols.set(h, comp);
      else unknownCols.push(h);
    }
    const unknownWithData = unknownCols.filter((h) => rows.some((r) => (r[h] ?? '').trim() !== ''));
    if (unknownWithData.length > 0) {
      throw AppError.badRequest(
        `Unknown column(s): ${unknownWithData.map((h) => `"${h}"`).join(', ')}. ` +
          `Component columns must be named exactly: ${ctx.components.map((c) => c.name).join(', ')}`,
      );
    }
    if (compCols.size === 0)
      throw AppError.badRequest('No component columns found — use the downloadable template');

    const byAdmission = new Map(
      ctx.enrollments.map((e) => [e.student.admissionNumber.toLowerCase(), e.studentId]),
    );
    const statusByKey = new Map(
      ctx.entries.map((e) => [`${e.studentId}:${e.componentId}`, e.status]),
    );

    const errors: { row: number; admissionNumber: string; component: string; reason: string }[] =
      [];
    interface Op {
      studentId: string;
      componentId: string;
      score: number;
    }
    const ops: Op[] = [];
    let skipped = 0;
    // Skip duplicate applications of the same cell (last one wins silently).
    const opIndex = new Map<string, number>();

    rows.forEach((row, i) => {
      const rowNo = i + 2;
      const admRaw = (row[admHeader] ?? '').trim();
      if (!admRaw) {
        errors.push({
          row: rowNo,
          admissionNumber: '—',
          component: '—',
          reason: 'missing admission number',
        });
        return;
      }
      const studentId = byAdmission.get(admRaw.toLowerCase());
      if (!studentId) {
        errors.push({
          row: rowNo,
          admissionNumber: admRaw,
          component: '—',
          reason: 'no such student in this class',
        });
        return;
      }
      for (const [header, comp] of compCols) {
        const raw = (row[header] ?? '').trim();
        if (raw === '') {
          skipped += 1;
          continue;
        }
        const score = Number(raw);
        if (!Number.isFinite(score)) {
          errors.push({
            row: rowNo,
            admissionNumber: admRaw,
            component: comp.name,
            reason: `"${raw}" is not a number`,
          });
          continue;
        }
        if (score < 0 || score > comp.maxScore) {
          errors.push({
            row: rowNo,
            admissionNumber: admRaw,
            component: comp.name,
            reason: `out of range 0–${comp.maxScore}`,
          });
          continue;
        }
        const mapKey = `${studentId}:${comp.id}`;
        const existing = opIndex.get(mapKey);
        if (existing !== undefined) ops[existing] = { studentId, componentId: comp.id, score };
        else {
          opIndex.set(mapKey, ops.length);
          ops.push({ studentId, componentId: comp.id, score });
        }
      }
    });

    // Lock rules match the interactive grid exactly.
    const isAdmin = req.user!.role === Role.ADMIN;
    for (const op of ops) {
      const st = statusByKey.get(`${op.studentId}:${op.componentId}`);
      if (st === 'PUBLISHED')
        throw AppError.conflict(
          'Marks are published and locked. Ask an administrator to unlock them first.',
        );
      if (st === 'APPROVED' && !isAdmin)
        throw AppError.conflict(
          'Marks have been approved and can no longer be edited by teachers. Ask an administrator to unlock them.',
        );
    }

    const teacherProfile = await prisma.teacherProfile.findFirst({
      where: { userId: req.user!.id },
      select: { id: true },
    });

    const importOperations: Prisma.PrismaPromise<unknown>[] = ops.map((op) => {
      const st = statusByKey.get(`${op.studentId}:${op.componentId}`);
      const keepApproved = st === 'APPROVED' && isAdmin;
      return prisma.gradeEntry.upsert({
        where: {
          studentId_componentId_semesterId: {
            studentId: op.studentId,
            componentId: op.componentId,
            semesterId,
          },
        },
        create: {
          studentId: op.studentId,
          componentId: op.componentId,
          subjectId,
          semesterId,
          score: op.score,
          enteredById: teacherProfile?.id ?? null,
          status: keepApproved ? 'APPROVED' : 'DRAFT',
        },
        update: {
          score: op.score,
          enteredById: teacherProfile?.id ?? undefined,
          status: keepApproved ? 'APPROVED' : 'DRAFT',
        },
      });
    });
    if (importOperations.length > 0) await prisma.$transaction(importOperations);

    // Admin overwriting approved marks → recompute immediately (mirrors /grades/entry).
    const overwroteApproved =
      isAdmin &&
      ops.some((op) => statusByKey.get(`${op.studentId}:${op.componentId}`) === 'APPROVED');
    if (overwroteApproved) {
      await recomputeSubjectResults(classId, subjectId, semesterId);
      await recomputeGpas(classId, semesterId);
    }

    await logAudit(req, 'IMPORT_GRADES', 'GradeEntry', undefined, {
      classId,
      subjectId,
      semesterId,
      applied: ops.length,
      skipped,
      failed: errors.length,
      file: req.file.originalname,
    });
    res.json({
      applied: ops.length,
      skipped,
      failed: errors.length,
      errors,
      file: req.file.originalname,
      recomputed: overwroteApproved,
    });
  }),
);
