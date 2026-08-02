import { Role } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { logAudit } from '../lib/audit';
import { AppError } from '../lib/errors';
import { ah, parseBody } from '../lib/helpers';
import { prisma } from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';

export const gradeScalesRouter = Router();
gradeScalesRouter.use(authenticate);

gradeScalesRouter.get(
  '/',
  ah(async (_req, res) => {
    const scales = await prisma.gradeScale.findMany({
      include: { bands: { orderBy: { minScore: 'desc' } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ data: scales });
  }),
);

const bandSchema = z.object({
  minScore: z.number().min(0).max(100),
  maxScore: z.number().min(0).max(100),
  letter: z.string().min(1).max(5),
  gradePoint: z.number().min(0).max(5),
  remark: z.string().min(1),
});

function validateBands(bands: z.infer<typeof bandSchema>[]) {
  const letters = new Set(bands.map((b) => b.letter.toUpperCase()));
  if (letters.size !== bands.length)
    throw AppError.badRequest('Duplicate grade letters are not allowed');
  const mins = bands.map((b) => b.minScore).sort((a, b) => a - b);
  for (let i = 1; i < mins.length; i++) {
    if (mins[i] === mins[i - 1])
      throw AppError.badRequest('Overlapping grade bands are not allowed');
  }
  for (const b of bands) {
    if (b.maxScore < b.minScore)
      throw AppError.badRequest(`Band ${b.letter}: maxScore must be ≥ minScore`);
  }
}

gradeScalesRouter.post(
  '/',
  authorize(Role.ADMIN),
  ah(async (req, res) => {
    const body = parseBody(
      z.object({ name: z.string().min(2), bands: z.array(bandSchema).min(2) }),
      req,
    );
    validateBands(body.bands);
    const scale = await prisma.gradeScale.create({
      data: { name: body.name, bands: { create: body.bands } },
      include: { bands: { orderBy: { minScore: 'desc' } } },
    });
    await logAudit(req, 'CREATE_GRADE_SCALE', 'GradeScale', scale.id, { name: body.name });
    res.status(201).json(scale);
  }),
);

gradeScalesRouter.put(
  '/:id',
  authorize(Role.ADMIN),
  ah(async (req, res) => {
    const body = parseBody(
      z.object({ name: z.string().min(2).optional(), bands: z.array(bandSchema).min(2) }),
      req,
    );
    const scale = await prisma.gradeScale.findUnique({ where: { id: req.params.id } });
    if (!scale) throw AppError.notFound('Grade scale');
    validateBands(body.bands);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.gradeScaleBand.deleteMany({ where: { scaleId: scale.id } });
      return tx.gradeScale.update({
        where: { id: scale.id },
        data: { name: body.name, bands: { create: body.bands } },
        include: { bands: { orderBy: { minScore: 'desc' } } },
      });
    });
    await logAudit(req, 'UPDATE_GRADE_SCALE', 'GradeScale', scale.id);
    res.json(updated);
  }),
);

gradeScalesRouter.post(
  '/:id/activate',
  authorize(Role.ADMIN),
  ah(async (req, res) => {
    const scale = await prisma.gradeScale.findUnique({
      where: { id: req.params.id },
      include: { bands: true },
    });
    if (!scale) throw AppError.notFound('Grade scale');
    if (scale.bands.length === 0)
      throw AppError.badRequest('Cannot activate a scale with no bands');
    await prisma.$transaction([
      prisma.gradeScale.updateMany({ data: { isActive: false } }),
      prisma.gradeScale.update({ where: { id: scale.id }, data: { isActive: true } }),
    ]);
    await logAudit(req, 'ACTIVATE_GRADE_SCALE', 'GradeScale', scale.id, { name: scale.name });
    res.json({ success: true });
  }),
);

gradeScalesRouter.delete(
  '/:id',
  authorize(Role.ADMIN),
  ah(async (req, res) => {
    const scale = await prisma.gradeScale.findUnique({ where: { id: req.params.id } });
    if (!scale) throw AppError.notFound('Grade scale');
    if (scale.isActive) throw AppError.conflict('Deactivate the scale before deleting it');
    await prisma.gradeScale.delete({ where: { id: scale.id } });
    await logAudit(req, 'DELETE_GRADE_SCALE', 'GradeScale', scale.id);
    res.json({ success: true });
  }),
);
