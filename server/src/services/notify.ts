import { prisma } from '../lib/prisma';
import { emailTemplates } from '../templates/emailTemplates';

import { EmailNotificationProvider } from './emailService';
import { createSMSProvider } from './smsService';

// Use string literal union to avoid dependency on generated Prisma client types
// (avoids "Module has no exported member" when prisma generate hasn't run)
type NotificationType = 'GRADES_PUBLISHED' | 'REPORT_CARD_AVAILABLE' | 'GRADE_CORRECTION' | 'ANNOUNCEMENT';

export async function notifyUsers(
  userIds: string[],
  type: NotificationType,
  title: string,
  message: string,
  link?: string,
): Promise<number> {
  if (userIds.length === 0) return 0;
  const unique = [...new Set(userIds)];
  const result = await prisma.notification.createMany({
    data: unique.map((userId) => ({ userId, type, title, message, link: link ?? null })),
  });
  return result.count;
}

/** Resolve the user accounts to notify for a set of student profiles (students + their parents). */
export async function studentAudienceUserIds(studentIds: string[]): Promise<string[]> {
  const students = await prisma.studentProfile.findMany({
    where: { id: { in: studentIds } },
    select: { userId: true, parent: { select: { userId: true } } },
  });
  const ids: string[] = [];
  for (const s of students) {
    ids.push(s.userId);
    if (s.parent?.userId) ids.push(s.parent.userId);
  }
  return [...new Set(ids)];
}

/**
 * Extended notification service: creates in-app notifications AND optionally
 * sends external notifications (email / SMS / WhatsApp-style) based on the
 * event type and user preferences.
 */
export class ExtendedNotificationService {
  private emailProvider = new EmailNotificationProvider();
  private smsProvider = createSMSProvider();

  async notifyInApp(
    userIds: string[],
    type: NotificationType,
    title: string,
    message: string,
    link?: string,
  ): Promise<number> {
    return notifyUsers(userIds, type, title, message, link);
  }

  async notifyEmail(userIds: string[], type: NotificationType, title: string, message: string, link?: string): Promise<number> {
    if (!userIds.length) return 0;
    // email is a required non-null column — no null filter needed.
    const users = await prisma.user.findMany({
      where: {
        id: { in: userIds },
        isActive: true,
      },
      select: { id: true, email: true, name: true },
    });
    if (!users.length) return 0;

    let sentCount = 0;
    for (const user of users) {
      const to = user.email;

      try {
        if (type === 'GRADES_PUBLISHED') {
          const tpl = emailTemplates.gradesPublished(user.name, title, message, link ?? '/grades');
          await this.emailProvider.sendEmail({ to, subject: tpl.subject, html: tpl.html, text: tpl.text });
          sentCount++;
        } else if (type === 'REPORT_CARD_AVAILABLE') {
          const tpl = emailTemplates.reportCardReady(user.name, message, link ?? '/report-cards');
          await this.emailProvider.sendEmail({ to, subject: tpl.subject, html: tpl.html, text: tpl.text });
          sentCount++;
        } else if (type === 'ANNOUNCEMENT') {
          const tpl = emailTemplates.announcementBroadcast(title, message, link);
          await this.emailProvider.sendEmail({ to, subject: tpl.subject, html: tpl.html, text: tpl.text });
          sentCount++;
        }
      } catch {
        // Silently continue on individual failures so one bad email doesn't break the batch
      }
    }
    return sentCount;
  }

  async notifySMS(userIds: string[], message: string, link?: string): Promise<number> {
    if (!userIds.length) return 0;
    const users = await prisma.user.findMany({
      where: {
        id: { in: userIds },
        isActive: true,
        phone: { not: null },
      },
      select: { id: true, phone: true, name: true },
    });
    if (!users.length) return 0;

    let sentCount = 0;
    for (const user of users) {
      if (!user.phone) continue;
      try {
        await this.smsProvider.sendSMS({
          to: user.phone,
          message: `${message}${link ? ` \n${link}` : ''}`,
          channel: 'whatsapp',
        });
        sentCount++;
      } catch {
        // Continue silently
      }
    }
    return sentCount;
  }

  /**
   * Combined external notification (email + optional SMS/WhatsApp) for a batch of users.
   */
  async notifyExternal(
    userIds: string[],
    type: NotificationType,
    title: string,
    message: string,
    link?: string,
    includeEmail = true,
    includeSMS = false,
  ): Promise<{ emailSent: number; smsSent: number }> {
    const uniqueIds = [...new Set(userIds)];
    const emailSent = includeEmail ? await this.notifyEmail(uniqueIds, type, title, message, link) : 0;
    const smsSent = includeSMS ? await this.notifySMS(uniqueIds, message, link) : 0;
    return { emailSent, smsSent };
  }
}
