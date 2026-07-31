import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { ah, parseBody } from '../lib/helpers';
import { logAudit } from '../lib/audit';
import { authenticate, authorize } from '../middleware/auth';
import { getSchoolSettings, processBadge } from '../services/school.service';

export const schoolRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(png|jpe?g|webp|gif|bmp|svg\+xml)$/.test(file.mimetype)) cb(null, true);
    else cb(null, false);
  },
});

// GET /api/school/public — branding for the login page & verify page (no auth)
schoolRouter.get('/public', ah(async (_req, res) => {
  const s = await getSchoolSettings();
  const activeYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
    select: { name: true },
  });
  res.json({
    name: s.name,
    motto: s.motto,
    hasBadge: s.badgeData !== null,
    academicYear: activeYear?.name ?? null,
  });
}));

// GET /api/school/badge — the badge image itself (public, cacheable)
schoolRouter.get('/badge', ah(async (_req, res) => {
  const s = await getSchoolSettings();
  if (!s.badgeData) throw AppError.notFound('Badge');
  res.setHeader('Content-Type', s.badgeMime ?? 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=600');
  res.send(Buffer.from(s.badgeData));
}));

// ── Admin management ────────────────────────────────────────────────────────

schoolRouter.get('/settings', authenticate, authorize(Role.ADMIN), ah(async (_req, res) => {
  const s = await getSchoolSettings();
  res.json({
    name: s.name,
    motto: s.motto,
    studentIdPrefix: s.studentIdPrefix,
    hasBadge: s.badgeData !== null,
    updatedAt: s.updatedAt,
  });
}));

schoolRouter.patch('/settings', authenticate, authorize(Role.ADMIN), ah(async (req, res) => {
  const body = parseBody(z.object({
    name: z.string().min(2).max(120).optional(),
    motto: z.string().max(160).optional(),
    studentIdPrefix: z.string().regex(/^[A-Z0-9]{2,6}$/, '2–6 uppercase letters/digits').optional(),
  }), req);
  await getSchoolSettings(); // ensure row exists
  const s = await prisma.schoolSetting.update({
    where: { id: 'school' },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.motto !== undefined ? { motto: body.motto } : {}),
      ...(body.studentIdPrefix !== undefined ? { studentIdPrefix: body.studentIdPrefix } : {}),
      updatedById: req.user!.id,
    },
  });
  await logAudit(req, 'UPDATE_SCHOOL_SETTINGS', 'SchoolSetting', 'school', { name: s.name, studentIdPrefix: s.studentIdPrefix });
  res.json({ name: s.name, motto: s.motto, studentIdPrefix: s.studentIdPrefix, hasBadge: s.badgeData !== null });
}));

// POST /api/school/badge — upload/replace the school badge
schoolRouter.post('/badge', authenticate, authorize(Role.ADMIN), upload.single('file'), ah(async (req, res) => {
  if (!req.file) throw AppError.badRequest('Attach an image file in the `file` field (PNG/JPG/SVG/WebP, max 5 MB)');
  let processed;
  try {
    processed = await processBadge(req.file.buffer);
  } catch (err) {
    throw AppError.badRequest(err instanceof Error ? err.message : 'Could not process the image');
  }
  await getSchoolSettings();
  await prisma.schoolSetting.update({
    where: { id: 'school' },
    data: { badgeData: processed.png, badgeMime: 'image/png', updatedById: req.user!.id },
  });
  await logAudit(req, 'UPDATE_SCHOOL_BADGE', 'SchoolSetting', 'school', { bytes: processed.png.length });
  res.status(201).json({ success: true, width: processed.width, height: processed.height });
}));

schoolRouter.delete('/badge', authenticate, authorize(Role.ADMIN), ah(async (req, res) => {
  await prisma.schoolSetting.update({
    where: { id: 'school' },
    data: { badgeData: null, badgeMime: null, updatedById: req.user!.id },
  });
  await logAudit(req, 'REMOVE_SCHOOL_BADGE', 'SchoolSetting', 'school');
  res.json({ success: true });
}));
