import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { prisma } from './prisma';
import { AppError } from './errors';

/** Wrap async route handlers so rejections reach the error middleware. */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/** Parse + validate req.query against a zod schema (throws ZodError → 422). */
export function parseQuery<S extends z.ZodTypeAny>(schema: S, req: Request): z.infer<S> {
  return schema.parse(req.query);
}

/** Parse + validate req.body against a zod schema (throws ZodError → 422). */
export function parseBody<S extends z.ZodTypeAny>(schema: S, req: Request): z.infer<S> {
  return schema.parse(req.body);
}

export function pagination(query: { page?: unknown; pageSize?: unknown }) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 10));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** Fields safe to expose for any user record (never the password hash). */
export const USER_SAFE_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  phone: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

/** The currently-open semester/term (exactly one is flagged `isCurrent`). */
export async function getActiveSemester() {
  const semester = await prisma.semester.findFirst({
    where: { isCurrent: true },
    include: { academicYear: true },
  });
  if (!semester) throw new AppError(409, 'No active semester/term is configured', 'NO_ACTIVE_SEMESTER');
  return semester;
}

const csvCell = (value: unknown): string => {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (rows: unknown[][]): string => rows.map((r) => r.map(csvCell).join(',')).join('\n');

export function sortDirection(dir: unknown): 'asc' | 'desc' {
  return dir === 'desc' ? 'desc' : 'asc';
}

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');
