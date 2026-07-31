import { Router } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { ah, parseBody } from '../lib/helpers';
import { logAudit } from '../lib/audit';
import { authenticate, authorize } from '../middleware/auth';

export const academicYearsRouter = Router();
academicYearsRouter.use(authenticate);

academicYearsRouter.get('/', ah(async (_req, res) => {
  const years = await prisma.academicYear.findMany({
    include: {
      semesters: { orderBy: { number: 'asc' } },
      _count: { select: { classes: true } },
    },
    orderBy: { startDate: 'desc' },
  });
  res.json({ data: years });
}));

// GET /api/academic-years/active — active year + all its terms (current flagged)
academicYearsRouter.get('/active', ah(async (_req, res) => {
  const year = await prisma.academicYear.findFirst({
    where: { isActive: true },
    include: { semesters: { orderBy: { number: 'asc' } } },
  });
  if (!year) throw new AppError(409, 'No active academic year configured', 'NO_ACTIVE_YEAR');
  res.json(year);
}));

const semesterInput = z.object({
  name: z.string().min(2),
  number: z.coerce.number().int().min(1).max(6),
  kind: z.enum(['TERM', 'SEMESTER']).default('TERM'),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

academicYearsRouter.post('/', authorize(Role.ADMIN), ah(async (req, res) => {
  const body = parseBody(z.object({
    name: z.string().min(4),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    activate: z.boolean().default(false),
    semesters: z.array(semesterInput).min(1),
  }), req);

  const year = await prisma.$transaction(async (tx) => {
    if (body.activate) await tx.academicYear.updateMany({ data: { isActive: false } });
    const created = await tx.academicYear.create({
      data: {
        name: body.name,
        startDate: body.startDate,
        endDate: body.endDate,
        isActive: body.activate,
        semesters: { create: body.semesters },
      },
      include: { semesters: true },
    });
    // Make the first term current so the system is immediately usable.
    const first = created.semesters.sort((a, b) => a.number - b.number)[0];
    if (first) await tx.semester.update({ where: { id: first.id }, data: { isCurrent: true } });
    return created;
  });

  await logAudit(req, 'CREATE_ACADEMIC_YEAR', 'AcademicYear', year.id, { name: body.name });
  res.status(201).json(year);
}));

academicYearsRouter.post('/:id/activate', authorize(Role.ADMIN), ah(async (req, res) => {
  const year = await prisma.academicYear.findUnique({ where: { id: req.params.id } });
  if (!year) throw AppError.notFound('Academic year');
  await prisma.$transaction([
    prisma.academicYear.updateMany({ data: { isActive: false } }),
    prisma.academicYear.update({ where: { id: year.id }, data: { isActive: true } }),
  ]);
  await logAudit(req, 'ACTIVATE_YEAR', 'AcademicYear', year.id);
  res.json({ success: true });
}));

academicYearsRouter.post('/:id/semesters', authorize(Role.ADMIN), ah(async (req, res) => {
  const body = parseBody(semesterInput, req);
  const year = await prisma.academicYear.findUnique({ where: { id: req.params.id } });
  if (!year) throw AppError.notFound('Academic year');
  const semester = await prisma.semester.create({ data: { ...body, academicYearId: year.id } });
  await logAudit(req, 'CREATE_SEMESTER', 'Semester', semester.id, { name: body.name });
  res.status(201).json(semester);
}));

// POST /api/academic-years/semesters/:semesterId/set-current — opens that term for grading
academicYearsRouter.post('/semesters/:semesterId/set-current', authorize(Role.ADMIN), ah(async (req, res) => {
  const semester = await prisma.semester.findUnique({ where: { id: req.params.semesterId } });
  if (!semester) throw AppError.notFound('Semester');
  await prisma.$transaction([
    prisma.semester.updateMany({ data: { isCurrent: false } }),
    prisma.semester.update({ where: { id: semester.id }, data: { isCurrent: true } }),
    prisma.academicYear.update({ where: { id: semester.academicYearId }, data: { isActive: true } }),
  ]);
  await logAudit(req, 'SET_CURRENT_SEMESTER', 'Semester', semester.id, { name: semester.name });
  res.json({ success: true });
}));
