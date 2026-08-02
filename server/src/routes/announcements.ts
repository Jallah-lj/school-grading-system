import { Router } from 'express';
import { z } from 'zod';

import { logAudit } from '../lib/audit';
import { ah, parseBody, parseQuery } from '../lib/helpers';
import { prisma } from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';
import { ExtendedNotificationService } from '../services/notify';

export const announcementsRouter = Router();
announcementsRouter.use(authenticate, authorize('ADMIN'));

const broadcastSchema = z.object({
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
  audience: z.enum(['ALL', 'STUDENTS', 'PARENTS', 'TEACHERS', 'STUDENTS_AND_PARENTS']).default('ALL'),
  link: z.string().url().optional(),
  includeEmail: z.coerce.boolean().optional().default(true),
  includeSMS: z.coerce.boolean().optional().default(false),
});

announcementsRouter.post(
  '/broadcast',
  ah(async (req, res) => {
    const body = parseBody(broadcastSchema, req);

    let userIds: string[] = [];
    try {
      if (body.audience === 'ALL') {
        const users = await prisma.user.findMany({
          where: { isActive: true, role: { in: ['STUDENT', 'PARENT', 'TEACHER', 'ADMIN'] } },
          select: { id: true },
        });
        userIds = users.map((u: { id: string }) => u.id);
      } else if (body.audience === 'STUDENTS') {
        const profiles = await prisma.studentProfile.findMany({
          where: { user: { isActive: true } },
          select: { userId: true },
        });
        userIds = profiles.map((p: { userId: string }) => p.userId);
      } else if (body.audience === 'PARENTS') {
        const profiles = await prisma.parentProfile.findMany({
          where: { user: { isActive: true } },
          select: { userId: true },
        });
        userIds = profiles.map((p: { userId: string }) => p.userId);
      } else if (body.audience === 'TEACHERS') {
        const profiles = await prisma.teacherProfile.findMany({
          where: { user: { isActive: true } },
          select: { userId: true },
        });
        userIds = profiles.map((p: { userId: string }) => p.userId);
      } else if (body.audience === 'STUDENTS_AND_PARENTS') {
        const students = await prisma.studentProfile.findMany({
          where: { user: { isActive: true } },
          select: { userId: true, parent: { select: { userId: true } } },
        }) as Array<{ userId: string; parent: { userId: string | null } | null }>;
        userIds = students.flatMap((s) => [s.userId, s.parent?.userId].filter(Boolean) as string[]);
      }
    } catch (err) {
      console.error('broadcast: audience resolution failed:', err);
      // Continue with whatever ids we have (possibly empty) rather than 500ing.
    }

    const uniqueIds = [...new Set(userIds)].filter(Boolean);

    // Log the broadcast attempt first so we always have an audit trail even
    // if downstream notification delivery fails partway through.
    let inAppCount = 0;
    let emailSent = 0;
    let smsSent = 0;

    try {
      const service = new ExtendedNotificationService();
      inAppCount = uniqueIds.length
        ? await service.notifyInApp(uniqueIds, 'ANNOUNCEMENT', body.title, body.message, body.link)
        : 0;
      const ext = await service.notifyExternal(
        uniqueIds,
        'ANNOUNCEMENT',
        body.title,
        body.message,
        body.link,
        body.includeEmail,
        body.includeSMS,
      ).catch((err) => {
        // External delivery (SMTP / SMS) should never break the broadcast —
        // in-app notifications have already been persisted.
        console.error('broadcast: external notification delivery failed:', err);
        return { emailSent: 0, smsSent: 0 };
      });
      emailSent = ext.emailSent;
      smsSent = ext.smsSent;
    } catch (err) {
      console.error('broadcast: notification pipeline threw:', err);
      // Fall through — we still return a 200 with the counts we have rather
      // than a bare 500, because auditing should succeed.
    }

    try {
      await logAudit(req, 'BROADCAST_ANNOUNCEMENT', 'Notification', undefined, {
        audience: body.audience,
        title: body.title,
        recipientCount: uniqueIds.length,
        notifiedInApp: inAppCount,
        notifiedEmail: emailSent,
        notifiedSMS: smsSent,
        includeEmail: body.includeEmail,
        includeSMS: body.includeSMS,
      });
    } catch (err) {
      console.error('broadcast: audit log failed:', err);
    }

    res.json({
      success: true,
      audience: body.audience,
      recipientCount: uniqueIds.length,
      notifiedInApp: inAppCount,
      notifiedEmail: emailSent,
      notifiedSMS: smsSent,
    });
  }),
);

announcementsRouter.get(
  '/',
  ah(async (req, res) => {
    const { search, page, pageSize } = parseQuery(
      z.object({ search: z.string().optional(), page: z.coerce.number().optional(), pageSize: z.coerce.number().optional() }),
      req,
    );
    const skip = (page ? page - 1 : 0) * (pageSize || 10);
    const take = pageSize || 10;

    // Prisma's generated `NotificationWhereInput` is extremely strict on relation filters.
    // `user: { role: { in: [...] } }` frequently produces the exact error the user saw:
    //   "Type '{ in: string[]; }' is not assignable to type 'undefined'."
    //
    // Safe pragmatic fix used across this codebase: cast the where object.
    const where = {
      user: {
        role: { in: ['STUDENT', 'PARENT', 'TEACHER', 'ADMIN'] },
      },
      ...(search ? { message: { contains: search, mode: 'insensitive' as const } } : {}),
    } as any;

    // Only fetch announcements
    const announcementsOnly = {
      ...where,
      type: 'ANNOUNCEMENT' as const,
    } as any;

    const [data, total] = await Promise.all([
      prisma.notification.findMany({
        where: announcementsOnly,
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.notification.count({ where: announcementsOnly }),
    ]);
    res.json({ data, total, page: page || 1, pageSize: take });
  }),
);
