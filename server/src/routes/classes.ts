import { Router } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { ah, parseBody, parseQuery } from '../lib/helpers';
import { logAudit } from '../lib/audit';
import { authenticate, authorize } from '../middleware/auth';

export const classesRouter = Router();
classesRouter.use(authenticate);

classesRouter.get('/', ah(async (req, res) => {
  const { academicYearId } = parseQuery(z.object({ academicYearId: z.string().optional() }), req);
  const classes = await prisma.classRoom.findMany({
    where: academicYearId ? { academicYearId } : {},
    include: {
      academicYear: { select: { id: true, name: true } },
      homeroomTeacher: { select: { id: true, user: { select: { name: true } } } },
      _count: { select: { students: true, assignments: true } },
    },
    orderBy: [{ level: 'asc' }, { name: 'asc' }, { stream: 'asc' }],
  });
  res.json({ data: classes });
}));

const upsertClassSchema = z.object({
  name: z.string().min(1),
  level: z.coerce.number().int().min(0).max(14),
  stream: z.string().min(1).max(10).default('A'),
  academicYearId: z.string(),
  homeroomTeacherId: z.string().nullable().optional(),
});

classesRouter.post('/', authorize(Role.ADMIN), ah(async (req, res) => {
  const body = parseBody(upsertClassSchema, req);
  const classRoom = await prisma.classRoom.create({ data: body });
  await logAudit(req, 'CREATE_CLASS', 'ClassRoom', classRoom.id, { name: body.name });
  res.status(201).json(classRoom);
}));

classesRouter.put('/:id', authorize(Role.ADMIN), ah(async (req, res) => {
  const body = parseBody(upsertClassSchema.partial(), req);
  const existing = await prisma.classRoom.findUnique({ where: { id: req.params.id } });
  if (!existing) throw AppError.notFound('Class');
  const classRoom = await prisma.classRoom.update({ where: { id: existing.id }, data: body });
  await logAudit(req, 'UPDATE_CLASS', 'ClassRoom', classRoom.id);
  res.json(classRoom);
}));

classesRouter.delete('/:id', authorize(Role.ADMIN), ah(async (req, res) => {
  const students = await prisma.studentProfile.count({ where: { classId: req.params.id } });
  if (students > 0) throw AppError.conflict(`Class still has ${students} students assigned`);
  await prisma.classRoom.delete({ where: { id: req.params.id } });
  await logAudit(req, 'DELETE_CLASS', 'ClassRoom', req.params.id);
  res.json({ success: true });
}));

classesRouter.get('/:id/students', ah(async (req, res) => {
  const students = await prisma.studentProfile.findMany({
    where: { classId: req.params.id },
    include: { user: { select: { id: true, name: true, email: true, isActive: true } } },
    orderBy: { user: { name: 'asc' } },
  });
  res.json({ data: students });
}));

classesRouter.get('/:id/subjects', ah(async (req, res) => {
  const assignments = await prisma.teacherAssignment.findMany({
    where: { classId: req.params.id },
    include: {
      subject: { include: { components: true } },
      teacher: { include: { user: { select: { name: true } } } },
    },
  });
  res.json({ data: assignments });
}));
