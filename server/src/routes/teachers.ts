import { Router } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { ah, pagination, parseBody, parseQuery, passwordSchema, USER_SAFE_SELECT } from '../lib/helpers';
import { hashPassword } from '../lib/password';
import { logAudit } from '../lib/audit';
import { assertPasswordConfirmed, authenticate, authorize } from '../middleware/auth';
import { generateStaffNumber, withIdRetry } from '../lib/idgen';
import { getSchoolContext } from '../services/school.service';

export const teachersRouter = Router();
teachersRouter.use(authenticate);

const TEACHER_INCLUDE = {
  user: { select: USER_SAFE_SELECT },
  assignments: {
    include: {
      subject: { select: { id: true, code: true, name: true } },
      classRoom: {
        select: {
          id: true, name: true, stream: true,
          _count: { select: { students: true } },
        },
      },
    },
  },
} as const;

// GET /api/teachers/me — the signed-in teacher's profile + assignments
teachersRouter.get('/me', authorize(Role.TEACHER, Role.ADMIN), ah(async (req, res) => {
  const teacher = await prisma.teacherProfile.findFirst({
    where: { userId: req.user!.id },
    include: TEACHER_INCLUDE,
  });
  if (!teacher) throw AppError.notFound('Teacher profile');
  res.json(teacher);
}));

teachersRouter.get('/', authorize(Role.ADMIN, Role.TEACHER), ah(async (req, res) => {
  const query = parseQuery(z.object({
    search: z.string().optional(),
    page: z.coerce.number().optional(),
    pageSize: z.coerce.number().optional(),
  }), req);
  const { skip, take, page, pageSize } = pagination(query);

  const where = query.search
    ? { OR: [
        { staffNumber: { contains: query.search, mode: 'insensitive' as const } },
        { user: { name: { contains: query.search, mode: 'insensitive' as const } } },
      ] }
    : {};

  const [data, total] = await Promise.all([
    prisma.teacherProfile.findMany({ where, include: TEACHER_INCLUDE, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.teacherProfile.count({ where }),
  ]);
  res.json({ data, total, page, pageSize });
}));

// GET /api/teachers/:id — full profile for detail page
teachersRouter.get('/:id', authorize(Role.ADMIN, Role.TEACHER), ah(async (req, res) => {
  const teacher = await prisma.teacherProfile.findUnique({
    where: { id: req.params.id },
    include: {
      ...TEACHER_INCLUDE,
      homeroomClasses: {
        select: { id: true, name: true, stream: true, _count: { select: { students: true } } },
        orderBy: { name: 'asc' },
      },
    },
  });
  if (!teacher) throw AppError.notFound('Teacher');
  res.json(teacher);
}));

const upsertTeacherSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  staffNumber: z.string().min(2).optional(), // auto-generated when omitted
  qualification: z.string().optional(),
  phone: z.string().optional(),
  hireDate: z.coerce.date().optional(),
  photoUrl: z.string().url().optional(),
});
const updateTeacherSchema = upsertTeacherSchema.omit({ staffNumber: true }).partial();

teachersRouter.post('/', authorize(Role.ADMIN), ah(async (req, res) => {
  const body = parseBody(upsertTeacherSchema.extend({ password: passwordSchema }), req);

  const school = await getSchoolContext();
  const teacher = await withIdRetry(() => prisma.$transaction(async (tx) => {
    const staffNumber = body.staffNumber ?? (await generateStaffNumber(tx, school.studentIdPrefix));
    const user = await tx.user.create({
      data: {
        email: body.email.toLowerCase(),
        name: body.name,
        role: Role.TEACHER,
        phone: body.phone,
        passwordHash: await hashPassword(body.password),
      },
    });
    return tx.teacherProfile.create({
      data: {
        userId: user.id,
        staffNumber,
        qualification: body.qualification,
        hireDate: body.hireDate,
        photoUrl: body.photoUrl,
      },
      include: TEACHER_INCLUDE,
    });
  }));

  await logAudit(req, 'CREATE_TEACHER', 'TeacherProfile', teacher.id, { staffNumber: teacher.staffNumber });
  res.status(201).json(teacher);
}));

teachersRouter.put('/:id', authorize(Role.ADMIN), ah(async (req, res) => {
  const body = parseBody(updateTeacherSchema, req);
  const existing = await prisma.teacherProfile.findUnique({ where: { id: req.params.id } });
  if (!existing) throw AppError.notFound('Teacher');

  const teacher = await prisma.$transaction(async (tx) => {
    if (body.name || body.email || body.phone) {
      await tx.user.update({
        where: { id: existing.userId },
        data: {
          ...(body.name ? { name: body.name } : {}),
          ...(body.email ? { email: body.email.toLowerCase() } : {}),
          ...(body.phone ? { phone: body.phone } : {}),
        },
      });
    }
    return tx.teacherProfile.update({
      where: { id: existing.id },
      data: { qualification: body.qualification, hireDate: body.hireDate, photoUrl: body.photoUrl },
      include: TEACHER_INCLUDE,
    });
  });

  await logAudit(req, 'UPDATE_TEACHER', 'TeacherProfile', teacher.id);
  res.json(teacher);
}));

// POST /api/teachers/:id/assignments — assign subject + class
teachersRouter.post('/:id/assignments', authorize(Role.ADMIN), ah(async (req, res) => {
  const body = parseBody(z.object({ subjectId: z.string(), classId: z.string() }), req);
  const teacher = await prisma.teacherProfile.findUnique({ where: { id: req.params.id } });
  if (!teacher) throw AppError.notFound('Teacher');
  const assignment = await prisma.teacherAssignment.upsert({
    where: {
      teacherId_subjectId_classId: { teacherId: teacher.id, subjectId: body.subjectId, classId: body.classId },
    },
    create: { teacherId: teacher.id, subjectId: body.subjectId, classId: body.classId },
    update: {},
    include: { subject: true, classRoom: true },
  });
  await logAudit(req, 'ASSIGN_TEACHER', 'TeacherAssignment', assignment.id, body);
  res.status(201).json(assignment);
}));

teachersRouter.delete('/:id/assignments/:assignmentId', authorize(Role.ADMIN), ah(async (req, res) => {
  await prisma.teacherAssignment.deleteMany({
    where: { id: req.params.assignmentId, teacherId: req.params.id },
  });
  await logAudit(req, 'UNASSIGN_TEACHER', 'TeacherAssignment', req.params.assignmentId);
  res.json({ success: true });
}));

// DELETE /api/teachers/:id — destructive: requires the admin to re-enter their
// own password (body: { password }). Failed confirmations are audit-logged.
teachersRouter.delete('/:id', authorize(Role.ADMIN), ah(async (req, res) => {
  const existing = await prisma.teacherProfile.findUnique({ where: { id: req.params.id } });
  if (!existing) throw AppError.notFound('Teacher');
  try {
    await assertPasswordConfirmed(req);
  } catch (err) {
    if (err instanceof AppError && err.code === 'PASSWORD_CONFIRMATION_FAILED') {
      await logAudit(req, 'DELETE_TEACHER_DENIED', 'TeacherProfile', existing.id, {
        staffNumber: existing.staffNumber, reason: 'password_verification_failed',
      });
    }
    throw err;
  }
  await prisma.user.delete({ where: { id: existing.userId } });
  await logAudit(req, 'DELETE_TEACHER', 'TeacherProfile', existing.id, { staffNumber: existing.staffNumber });
  res.json({ success: true });
}));
