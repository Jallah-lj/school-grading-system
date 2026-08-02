import { z } from 'zod';

import { AppError } from '../lib/errors';
import { verifyAccessToken } from '../lib/jwt';
import { verifyPassword } from '../lib/password';
import { prisma } from '../lib/prisma';

import type { Role } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';

/** Require a valid Bearer access token. Attaches `req.user`. */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(AppError.unauthorized());
  try {
    const payload = verifyAccessToken(header.slice(7));
    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role as Role,
    };
    next();
  } catch {
    next(new AppError(401, 'Invalid or expired access token', 'INVALID_TOKEN'));
  }
}

/** Role-based access control — pass one or more allowed roles. */
export const authorize =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) return next(AppError.forbidden());
    next();
  };

/**
 * Step-up authentication for destructive actions: the signed-in user must
 * re-enter their own password, sent in the request body as `{ password }`.
 * Throws BAD_REQUEST when missing, 403 PASSWORD_CONFIRMATION_FAILED when wrong.
 */
export async function assertPasswordConfirmed(req: Request): Promise<void> {
  const parsed = z.object({ password: z.string().min(1) }).safeParse(req.body ?? {});
  if (!parsed.success) {
    throw AppError.badRequest('Password confirmation is required for this action');
  }
  const me = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { passwordHash: true },
  });
  if (!me || !(await verifyPassword(parsed.data.password, me.passwordHash))) {
    throw new AppError(
      403,
      'Incorrect password — the action was denied to protect school records',
      'PASSWORD_CONFIRMATION_FAILED',
    );
  }
}
