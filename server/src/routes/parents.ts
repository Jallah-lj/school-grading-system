import { Router } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { ah, pagination, parseBody, parseQuery, passwordSchema, USER_SAFE_SELECT } from '../lib/helpers';
import { hashPassword } from '../lib/password';
import { logAudit } from '../lib/audit';
import { assertPasswordConfirmed, authenticate, authorize } from '../middleware/auth';

export const parentsRouter = Router();
parentsRouter.use(authenticate);

const PARENT_INCLUDE = {
  user: { select: USER_SAFE_SELECT },
  children: {
    select: {
      id: true,
      admissionNumber: true,
      classRoom: { select: { id: true, name: true, stream: true } },
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
} as const;

// GET /api/parents — search + paginate parent accounts with their linked children
parentsRouter.get('/', authorize(Role.ADMIN), ah(async (req, res) => {
  const query = parseQuery(z.object({
    search: z.string().optional(),
    page: z.coerce.number().optional(),
    pageSize: z.coerce.number().optional(),
  }), req);
  const { skip, take, page, pageSize } = pagination(query);

  const where = query.search
    ? { OR: [
        { user: { name: { contains: query.search, mode: 'insensitive' as const } } },
        { user: { email: { contains: query.search, mode: 'insensitive' as const } } },
      ] }
    : {};

  const [data, total] = await Promise.all([
    prisma.parentProfile.findMany({ where, include: PARENT_INCLUDE, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.parentProfile.count({ where }),
  ]);
  res.json({ data, total, page, pageSize });
}));

// GET /api/parents/:id — full detail (user + children)
parentsRouter.get('/:id', authorize(Role.ADMIN), ah(async (req, res) => {
  const parent = await prisma.parentProfile.findUnique({
    where: { id: req.params.id },
    include: PARENT_INCLUDE,
  });
  if (!parent) throw AppError.notFound('Parent');
  res.json(parent);
}));

const createParentSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: passwordSchema,
  phone: z.string().optional(),
});
const updateParentSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phone: z.string().nullable().optional(),
});

// POST /api/parents — admin creates a parent login account + profile
parentsRouter.post('/', authorize(Role.ADMIN), ah(async (req, res) => {
  const body = parseBody(createParentSchema, req);
  const email = body.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw AppError.conflict(`An account with email ${email} already exists`);

  const parent = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        name: body.name,
        role: Role.PARENT,
        phone: body.phone,
        passwordHash: await hashPassword(body.password),
      },
    });
    return tx.parentProfile.create({
      data: { userId: user.id },
      include: PARENT_INCLUDE,
    });
  });

  await logAudit(req, 'CREATE_PARENT', 'ParentProfile', parent.id, { email });
  res.status(201).json(parent);
}));

// PUT /api/parents/:id — update name / email / phone
parentsRouter.put('/:id', authorize(Role.ADMIN), ah(async (req, res) => {
  const body = parseBody(updateParentSchema, req);
  const existing = await prisma.parentProfile.findUnique({ where: { id: req.params.id } });
  if (!existing) throw AppError.notFound('Parent');

  if (body.email) {
    const email = body.email.toLowerCase();
    const taken = await prisma.user.findFirst({ where: { email, id: { not: existing.userId } } });
    if (taken) throw AppError.conflict(`An account with email ${email} already exists`);
  }

  const parent = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: existing.userId },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.email ? { email: body.email.toLowerCase() } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
      },
    });
    return tx.parentProfile.findUniqueOrThrow({ where: { id: existing.id }, include: PARENT_INCLUDE });
  });

  await logAudit(req, 'UPDATE_PARENT', 'ParentProfile', parent.id);
  res.json(parent);
}));

// POST /api/parents/:id/reset-password — set a new password + revoke sessions
parentsRouter.post('/:id/reset-password', authorize(Role.ADMIN), ah(async (req, res) => {
  const { password } = parseBody(z.object({ password: passwordSchema }), req);
  const parent = await prisma.parentProfile.findUnique({ where: { id: req.params.id } });
  if (!parent) throw AppError.notFound('Parent');

  await prisma.user.update({
    where: { id: parent.userId },
    data: { passwordHash: await hashPassword(password) },
  });
  await prisma.refreshToken.updateMany({
    where: { userId: parent.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await logAudit(req, 'RESET_PARENT_PASSWORD', 'ParentProfile', parent.id);
  res.json({ success: true });
}));

// POST /api/parents/:id/children — link a student to this parent
parentsRouter.post('/:id/children', authorize(Role.ADMIN), ah(async (req, res) => {
  const { studentId } = parseBody(z.object({ studentId: z.string().min(1) }), req);
  const parent = await prisma.parentProfile.findUnique({ where: { id: req.params.id } });
  if (!parent) throw AppError.notFound('Parent');

  const student = await prisma.studentProfile.findUnique({
    where: { id: studentId },
    select: { id: true, parentId: true, admissionNumber: true, user: { select: { name: true } } },
  });
  if (!student) throw AppError.notFound('Student');
  if (student.parentId && student.parentId !== parent.id) {
    throw AppError.conflict(`“${student.user.name}” is already linked to another parent. Unlink them there or edit the student record.`);
  }

  const updated = await prisma.studentProfile.update({
    where: { id: student.id },
    data: { parentId: parent.id },
    select: {
      id: true,
      admissionNumber: true,
      classRoom: { select: { id: true, name: true, stream: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  });
  await logAudit(req, 'LINK_PARENT_CHILD', 'StudentProfile', student.id, { parentId: parent.id });
  res.status(201).json(updated);
}));

// DELETE /api/parents/:id/children/:studentId — unlink a student
parentsRouter.delete('/:id/children/:studentId', authorize(Role.ADMIN), ah(async (req, res) => {
  const parent = await prisma.parentProfile.findUnique({ where: { id: req.params.id } });
  if (!parent) throw AppError.notFound('Parent');

  const student = await prisma.studentProfile.findUnique({
    where: { id: req.params.studentId },
    select: { id: true, parentId: true },
  });
  if (!student) throw AppError.notFound('Student');
  if (student.parentId !== parent.id) {
    throw AppError.badRequest('This student is not linked to this parent');
  }

  await prisma.studentProfile.update({
    where: { id: student.id },
    data: { parentId: null },
  });
  await logAudit(req, 'UNLINK_PARENT_CHILD', 'StudentProfile', student.id, { parentId: parent.id });
  res.json({ success: true });
}));

// DELETE /api/parents/:id — destructive: requires the admin to re-enter their
// own password (body: { password }). Failed confirmations are audit-logged.
// Deleting the account also removes the ParentProfile; the students linked to
// this parent are unlinked (parentId → null) but otherwise untouched.
parentsRouter.delete('/:id', authorize(Role.ADMIN), ah(async (req, res) => {
  const existing = await prisma.parentProfile.findUnique({
    where: { id: req.params.id },
    include: { user: { select: { email: true } } },
  });
  if (!existing) throw AppError.notFound('Parent');
  try {
    await assertPasswordConfirmed(req);
  } catch (err) {
    if (err instanceof AppError && err.code === 'PASSWORD_CONFIRMATION_FAILED') {
      await logAudit(req, 'DELETE_PARENT_DENIED', 'ParentProfile', existing.id, {
        email: existing.user.email, reason: 'password_verification_failed',
      });
    }
    throw err;
  }
  await prisma.user.delete({ where: { id: existing.userId } }); // cascades to ParentProfile; children unlinked
  await logAudit(req, 'DELETE_PARENT', 'ParentProfile', existing.id, { email: existing.user.email });
  res.json({ success: true });
}));
