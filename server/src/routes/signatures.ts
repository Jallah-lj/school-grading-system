import { Role } from '@prisma/client';
import { Router } from 'express';
import multer from 'multer';

import { logAudit } from '../lib/audit';
import { AppError } from '../lib/errors';
import { ah } from '../lib/helpers';
import { prisma } from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';
import { processSignatureImage } from '../services/signature.service';

export const signaturesRouter = Router();
signaturesRouter.use(authenticate, authorize(Role.TEACHER, Role.ADMIN));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (/^image\/(png|jpe?g|webp|gif|bmp)$/.test(file.mimetype)) cb(null, true);
    else cb(null, false);
  },
});

const META_SELECT = { id: true, title: true, width: true, height: true, updatedAt: true } as const;

/**
 * POST /api/signatures/me
 * multipart/form-data, field `file`:
 *   - a drawing straight from the browser signature pad (transparent PNG), or
 *   - a phone photo/scan of a paper signature (auto-cleaned server-side)
 * Optional field `title` — defaults to Class Teacher / Principal by role.
 */
signaturesRouter.post(
  '/me',
  upload.single('file'),
  ah(async (req, res) => {
    if (!req.file) {
      throw AppError.badRequest(
        'Attach an image file in the `file` field (PNG, JPG or WebP, max 5 MB)',
      );
    }

    const defaultTitle =
      req.user!.role === Role.ADMIN ? 'Principal / Head of School' : 'Class Teacher';
    const bodyTitle = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const title = (bodyTitle || defaultTitle).slice(0, 80);

    let processed;
    try {
      processed = await processSignatureImage(req.file.buffer);
    } catch (err) {
      throw AppError.badRequest(err instanceof Error ? err.message : 'Could not process the image');
    }
    if (processed.png.length > 350_000) {
      throw AppError.badRequest(
        'Signature image is still too large after compression — retake a closer photo with less background',
      );
    }

    const signature = await prisma.signature.upsert({
      where: { userId: req.user!.id },
      create: {
        userId: req.user!.id,
        title,
        data: processed.png,
        width: processed.width,
        height: processed.height,
      },
      update: { title, data: processed.png, width: processed.width, height: processed.height },
      select: META_SELECT,
    });

    await logAudit(req, 'UPLOAD_SIGNATURE', 'Signature', signature.id, {
      bytes: processed.png.length,
      width: processed.width,
      height: processed.height,
    });
    res.status(201).json(signature);
  }),
);

// GET /api/signatures/me/meta — does the current user have a signature saved?
signaturesRouter.get(
  '/me/meta',
  ah(async (req, res) => {
    const signature = await prisma.signature.findUnique({
      where: { userId: req.user!.id },
      select: META_SELECT,
    });
    if (!signature) throw AppError.notFound('Signature');
    res.json(signature);
  }),
);

// GET /api/signatures/me — the PNG image itself
signaturesRouter.get(
  '/me',
  ah(async (req, res) => {
    const signature = await prisma.signature.findUnique({ where: { userId: req.user!.id } });
    if (!signature) throw AppError.notFound('Signature');
    res.setHeader('Content-Type', signature.mime);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(Buffer.from(signature.data));
  }),
);

// GET /api/signatures/user/:userId — admin inspects any user's signature
signaturesRouter.get(
  '/user/:userId',
  authorize(Role.ADMIN),
  ah(async (req, res) => {
    const signature = await prisma.signature.findUnique({ where: { userId: req.params.userId } });
    if (!signature) throw AppError.notFound('Signature');
    res.setHeader('Content-Type', signature.mime);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(Buffer.from(signature.data));
  }),
);

// DELETE /api/signatures/me
signaturesRouter.delete(
  '/me',
  ah(async (req, res) => {
    await prisma.signature.deleteMany({ where: { userId: req.user!.id } });
    await logAudit(req, 'DELETE_SIGNATURE', 'Signature', undefined);
    res.json({ success: true });
  }),
);
