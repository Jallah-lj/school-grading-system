import type { NotificationType } from '@prisma/client';
import { prisma } from '../lib/prisma';

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
