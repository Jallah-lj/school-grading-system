import { Role } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { logAudit } from '../lib/audit';
import { AppError } from '../lib/errors';
import {
  ah,
  pagination,
  parseBody,
  parseQuery,
  passwordSchema,
  USER_SAFE_SELECT,
} from '../lib/helpers';
import { hashPassword } from '../lib/password';
import { prisma } from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';

export const usersRouter = Router();
usersRouter.use(authenticate, authorize(Role.ADMIN));

// GET /api/users — list with filters + pagination
usersRouter.get(
  '/',
  ah(async (req, res) => {
    const query = parseQuery(
      z.object({
        role: z.nativeEnum(Role).optional(),
        search: z.string().optional(),
        page: z.coerce.number().optional(),
        pageSize: z.coerce.number().optional(),
      }),
      req,
    );
    const { skip, take, page, pageSize } = pagination(query);

    const where = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { email: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: { ...USER_SAFE_SELECT, signature: { select: { id: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.user.count({ where }),
    ]);
    res.json({ data, total, page, pageSize });
  }),
);

// PATCH /api/users/:id — activate/deactivate or change role
usersRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const body = parseBody(
      z.object({
        isActive: z.boolean().optional(),
        role: z.nativeEnum(Role).optional(),
      }),
      req,
    );

    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw AppError.notFound('User');
    if (target.id === req.user!.id && body.isActive === false) {
      throw AppError.badRequest('You cannot deactivate your own account');
    }

    const user = await prisma.user.update({
      where: { id: target.id },
      data: { isActive: body.isActive, role: body.role },
      select: USER_SAFE_SELECT,
    });
    await logAudit(req, 'UPDATE_USER', 'User', target.id, body);
    res.json(user);
  }),
);

// POST /api/users/:id/reset-password
usersRouter.post(
  '/:id/reset-password',
  ah(async (req, res) => {
    const { password } = parseBody(z.object({ password: passwordSchema }), req);
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw AppError.notFound('User');

    await prisma.user.update({
      where: { id: target.id },
      data: { passwordHash: await hashPassword(password) },
    });
    await prisma.refreshToken.updateMany({
      where: { userId: target.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await logAudit(req, 'RESET_PASSWORD', 'User', target.id);
    res.json({ success: true });
  }),
);
