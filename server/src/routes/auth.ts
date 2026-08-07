import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { logAudit } from '../lib/audit';
import { AppError } from '../lib/errors';
import { ah, parseBody, passwordSchema, USER_SAFE_SELECT } from '../lib/helpers';
import { hashToken, signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt';
import { hashPassword, verifyPassword } from '../lib/password';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';

export const authRouter = Router();

/** Shape returned to the SPA after login / refresh / me. */
async function sessionPayload(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...USER_SAFE_SELECT,
      studentProfile: {
        select: {
          id: true,
          admissionNumber: true,
          photoUrl: true,
          classRoom: { select: { id: true, name: true, stream: true } },
        },
      },
      teacherProfile: {
        select: { id: true, staffNumber: true, photoUrl: true },
      },
      parentProfile: {
        select: {
          id: true,
          children: {
            select: {
              id: true,
              admissionNumber: true,
              user: { select: { name: true } },
              classRoom: { select: { name: true, stream: true } },
            },
          },
        },
      },
    },
  });
  if (!user) throw AppError.notFound('User');
  const { studentProfile, teacherProfile, parentProfile, ...base } = user;
  return {
    ...base,
    student: studentProfile ?? undefined,
    teacher: teacherProfile ?? undefined,
    parent: parentProfile ?? undefined,
  };
}

async function issueTokens(user: { id: string; role: string; email: string; name: string }) {
  const accessToken = signAccessToken(user);
  const refresh = signRefreshToken(user);
  await prisma.refreshToken.create({
    data: { tokenHash: refresh.tokenHash, userId: user.id, expiresAt: refresh.expiresAt },
  });
  return { accessToken, refreshToken: refresh.token };
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post(
  '/login',
  ah(async (req, res) => {
    const { email, password } = parseBody(loginSchema, req);

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }
    if (!user.isActive)
      throw new AppError(403, 'This account has been deactivated', 'ACCOUNT_DISABLED');

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const tokens = await issueTokens(user);
    await logAudit(req, 'LOGIN', 'User', user.id);

    res.json({ user: await sessionPayload(user.id), ...tokens });
  }),
);

const refreshSchema = z.object({ refreshToken: z.string().min(10) });

authRouter.post(
  '/refresh',
  ah(async (req, res) => {
    const { refreshToken } = parseBody(refreshSchema, req);

    try {
      verifyRefreshToken(refreshToken); // validates the token; the payload is not needed here
    } catch {
      throw new AppError(401, 'Invalid or expired refresh token', 'INVALID_REFRESH');
    }

    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: true },
    });
    if (!stored || stored.expiresAt < new Date()) {
      throw new AppError(401, 'Invalid or expired refresh token', 'INVALID_REFRESH');
    }

    if (stored.revokedAt) {
      // Refresh-token reuse detected → kill the whole session family.
      await prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new AppError(401, 'Session invalidated', 'TOKEN_REUSE_DETECTED');
    }

    if (!stored.user.isActive) throw new AppError(403, 'Account disabled', 'ACCOUNT_DISABLED');

    // Rotate: revoke the presented token and issue a fresh pair.
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    const tokens = await issueTokens(stored.user);

    res.json({ user: await sessionPayload(stored.userId), ...tokens });
  }),
);

authRouter.post(
  '/logout',
  ah(async (req, res) => {
    const { refreshToken } = parseBody(refreshSchema, req);
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    res.json({ success: true });
  }),
);

authRouter.get(
  '/me',
  authenticate,
  ah(async (req, res) => {
    res.json({ user: await sessionPayload(req.user!.id) });
  }),
);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

authRouter.post(
  '/change-password',
  authenticate,
  ah(async (req, res) => {
    const { currentPassword, newPassword } = parseBody(changePasswordSchema, req);
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new AppError(400, 'Current password is incorrect', 'BAD_PASSWORD');
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    // Force re-login on all devices.
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await logAudit(req, 'CHANGE_PASSWORD', 'User', user.id);
    res.json({ success: true });
  }),
);

// ─── Password reset via on-page 6-digit code ────────────────────────────────
// The code is displayed on the page after email verification (no email needed).

const CODE_EXPIRY_MS = 10 * 60 * 1000;   // 10 minutes
const MAX_VERIFY_ATTEMPTS = 3;

function generateCode(): string {
  // 6-digit numeric code, padded with leading zeros if needed.
  return String(Math.floor(100000 + Math.random() * 900000));
}

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const verifyCodeSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6, 'Code must be exactly 6 digits'),
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6, 'Code must be exactly 6 digits'),
  newPassword: passwordSchema,
});

authRouter.post(
  '/forgot-password',
  ah(async (req, res) => {
    const { email } = parseBody(forgotPasswordSchema, req);
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user || !user.isActive) {
      // Always return the same shape to prevent account enumeration.
      return res.json({
        success: true,
        message: 'If an account exists, a verification code has been generated.',
      });
    }

    // Invalidate any unused codes for this user first.
    await prisma.passwordResetCode.updateMany({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });

    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MS);

    await prisma.passwordResetCode.create({
      data: { userId: user.id, code, expiresAt },
    });

    await logAudit(req, 'FORGOT_PASSWORD', 'User', user.id);

    // Return the code so the frontend can display it on the page.
    // The code is also stored hashed-free in the DB for verification.
    res.json({
      success: true,
      message: 'Verification code generated. Enter it on the next page along with your new password.',
      code, // displayed on the page — not sent via email
      expiresInSeconds: Math.round(CODE_EXPIRY_MS / 1000),
    });
  }),
);

authRouter.post(
  '/verify-reset-code',
  ah(async (req, res) => {
    const { email, code } = parseBody(verifyCodeSchema, req);
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user || !user.isActive) {
      throw new AppError(404, 'User not found or account is disabled', 'USER_NOT_FOUND');
    }

    const stored = await prisma.passwordResetCode.findFirst({
      where: {
        userId: user.id,
        code,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!stored) {
      throw new AppError(400, 'Invalid or expired verification code', 'INVALID_CODE');
    }

    res.json({ valid: true, userId: user.id });
  }),
);

authRouter.post(
  '/reset-password',
  ah(async (req, res) => {
    const { email, code, newPassword } = parseBody(resetPasswordSchema, req);
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user || !user.isActive) {
      throw new AppError(404, 'User not found or account is disabled', 'USER_NOT_FOUND');
    }

    // Find and consume the code in one go.
    const stored = await prisma.passwordResetCode.findFirst({
      where: {
        userId: user.id,
        code,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!stored) {
      throw new AppError(400, 'Invalid or expired verification code', 'INVALID_CODE');
    }

    // Mark code as used.
    await prisma.passwordResetCode.update({
      where: { id: stored.id },
      data: { usedAt: new Date() },
    });

    // Update password and revoke all sessions.
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await logAudit(req, 'RESET_PASSWORD', 'User', user.id);
    res.json({ success: true, message: 'Password reset successfully. You can now log in with your new password.' });
  }),
);
