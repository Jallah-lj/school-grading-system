import { prisma } from './prisma';

import type { Request } from 'express';

/** Persist an audit-trail entry. Never throws — auditing must not break requests. */
export async function logAudit(
  req: Request,
  action: string,
  entity: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: req.user?.id ?? null,
        action,
        entity,
        entityId: entityId ?? null,
        metadata: metadata === undefined ? undefined : (metadata as object),
        ipAddress: req.ip ?? null,
      },
    });
  } catch (err) {
    console.error('audit log failed:', err);
  }
}
