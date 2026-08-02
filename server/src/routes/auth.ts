import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';

import { logAudit } from '../lib/audit';
import { AppError } from '../lib/errors';
import { ah, parseBody, passwordSchema, USER_SAFE_SELECT } from '../lib/helpers';
import { hashToken, signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt';
import { hashPassword, verifyPassword } from '../lib/password';
import { EmailNotificationProvider } from '../services/emailService';
import { emailTemplates } from '../templates/emailTemplates';
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

// ─── Password reset (email-based, no database storage needed) ────────────

import jwt from 'jsonwebtoken';

function signResetToken(userId: string): string {
  const secret = (process.env.JWT_ACCESS_SECRET || 'default-secret-change-me') + '-reset';
  return jwt.sign({ sub: userId, purpose: 'password-reset' }, secret, { expiresIn: '15m' });
}

function verifyResetToken(token: string): { sub: string } {
  const secret = (process.env.JWT_ACCESS_SECRET || 'default-secret-change-me') + '-reset';
  return jwt.verify(token, secret) as { sub: string };
}

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(10),
  newPassword: passwordSchema,
});

authRouter.post(
  '/forgot-password',
  ah(async (req, res) => {
    const { email } = parseBody(forgotPasswordSchema, req);
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    // Always return success so attackers cannot enumerate accounts.
    if (!user || !user.isActive) {
      return res.json({ success: true, message: 'If an account exists, a reset email has been sent.' });
    }

    const resetToken = signResetToken(user.id);
    const resetLink = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password?token=${encodeURIComponent(resetToken)}`;
    const tpl = emailTemplates.passwordReset(user.name, resetLink);

    const provider = new EmailNotificationProvider();
    await provider.sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html, text: tpl.text });

    await logAudit(req, 'FORGOT_PASSWORD', 'User', user.id);
    res.json({ success: true, message: 'If an account exists, a reset email has been sent.' });
  }),
);

authRouter.post(
  '/reset-password',
  ah(async (req, res) => {
    const { token, newPassword } = parseBody(resetPasswordSchema, req);
    let payload: { sub: string };
    try {
      payload = verifyResetToken(token);
    } catch {
      throw new AppError(400, 'Invalid or expired reset token', 'INVALID_RESET_TOKEN');
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub, isActive: true } });
    if (!user) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');

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
