import { Router } from 'express';
import { z } from 'zod';
import { ComponentType, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { ah, parseBody } from '../lib/helpers';
import { logAudit } from '../lib/audit';
import { authenticate, authorize } from '../middleware/auth';

export const subjectsRouter = Router();
subjectsRouter.use(authenticate);

subjectsRouter.get('/', ah(async (_req, res) => {
  const subjects = await prisma.subject.findMany({
    include: {
      components: { orderBy: { type: 'asc' } },
      _count: { select: { assignments: true, subjectResults: true } },
    },
    orderBy: { code: 'asc' },
  });
  res.json({ data: subjects });
}));

const upsertSubjectSchema = z.object({
  code: z.string().min(2).max(12),
  name: z.string().min(2),
  creditUnits: z.coerce.number().positive().max(20),
  department: z.string().optional(),
  description: z.string().optional(),
});

subjectsRouter.post('/', authorize(Role.ADMIN), ah(async (req, res) => {
  const body = parseBody(upsertSubjectSchema, req);
  const subject = await prisma.subject.create({
    data: { ...body, code: body.code.toUpperCase() },
    include: { components: true },
  });
  await logAudit(req, 'CREATE_SUBJECT', 'Subject', subject.id, { code: body.code });
  res.status(201).json(subject);
}));

subjectsRouter.put('/:id', authorize(Role.ADMIN), ah(async (req, res) => {
  const body = parseBody(upsertSubjectSchema.partial(), req);
  const existing = await prisma.subject.findUnique({ where: { id: req.params.id } });
  if (!existing) throw AppError.notFound('Subject');
  const subject = await prisma.subject.update({
    where: { id: existing.id },
    data: { ...body, ...(body.code ? { code: body.code.toUpperCase() } : {}) },
    include: { components: true },
  });
  await logAudit(req, 'UPDATE_SUBJECT', 'Subject', subject.id);
  res.json(subject);
}));

subjectsRouter.delete('/:id', authorize(Role.ADMIN), ah(async (req, res) => {
  const results = await prisma.subjectResult.count({ where: { subjectId: req.params.id } });
  if (results > 0) {
    throw AppError.conflict('This subject has computed results and cannot be deleted');
  }
  await prisma.subject.delete({ where: { id: req.params.id } });
  await logAudit(req, 'DELETE_SUBJECT', 'Subject', req.params.id);
  res.json({ success: true });
}));

const componentsSchema = z.object({
  components: z.array(z.object({
    type: z.nativeEnum(ComponentType),
    name: z.string().min(1),
    weight: z.number().positive().max(100),
    maxScore: z.number().positive().max(1000).default(100),
  })).min(1),
});

// PUT /api/subjects/:id/components — full replacement; weights must sum to 100
subjectsRouter.put('/:id/components', authorize(Role.ADMIN), ah(async (req, res) => {
  const { components } = parseBody(componentsSchema, req);
  const subject = await prisma.subject.findUnique({ where: { id: req.params.id } });
  if (!subject) throw AppError.notFound('Subject');

  const total = components.reduce((a, c) => a + c.weight, 0);
  if (Math.abs(total - 100) > 0.001) {
    throw AppError.badRequest(`Component weights must sum to 100 (got ${total})`);
  }

  await prisma.$transaction([
    prisma.assessmentComponent.deleteMany({ where: { subjectId: subject.id } }),
    prisma.assessmentComponent.createMany({
      data: components.map((c) => ({ ...c, subjectId: subject.id })),
    }),
  ]);
  const updated = await prisma.subject.findUnique({ where: { id: subject.id }, include: { components: true } });
  await logAudit(req, 'CONFIGURE_COMPONENTS', 'Subject', subject.id, { total });
  res.json(updated);
}));
