import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

import { AppError } from '../lib/errors';

import type { NextFunction, Request, Response } from 'express';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: err.flatten(),
      },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        error: {
          code: 'UNIQUE_CONSTRAINT',
          message: 'A record with these unique fields already exists',
          details: err.meta,
        },
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found' } });
      return;
    }
    if (err.code === 'P2003') {
      res
        .status(409)
        .json({ error: { code: 'FK_CONSTRAINT', message: 'Related record constraint failed' } });
      return;
    }
    if (err.code === 'P2024' || err.code === 'P2028') {
      res.status(503).json({
        error: {
          code: 'DATABASE_BUSY',
          message: 'The database is busy processing another request. Please retry in a moment.',
        },
      });
      return;
    }
  }

  console.error('Unhandled error:', err);
  res
    .status(500)
    .json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
}
