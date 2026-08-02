import { Role } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { ah, pagination, parseQuery } from '../lib/helpers';
import { prisma } from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';

export const adminRouter = Router();
adminRouter.use(authenticate, authorize(Role.ADMIN));

// GET /api/admin/audit-logs/meta — distinct actions & entities for filter dropdowns
adminRouter.get(
  '/audit-logs/meta',
  ah(async (_req, res) => {
    const [actions, entities] = await Promise.all([
      prisma.auditLog.findMany({
        select: { action: true },
        distinct: ['action'],
        orderBy: { action: 'asc' },
      }),
      prisma.auditLog.findMany({
        select: { entity: true },
        distinct: ['entity'],
        orderBy: { entity: 'asc' },
      }),
    ]);
    res.json({ actions: actions.map((a) => a.action), entities: entities.map((e) => e.entity) });
  }),
);

// GET /api/admin/audit-logs — audit trail viewer with filters & pagination
adminRouter.get(
  '/audit-logs',
  ah(async (req, res) => {
    const query = parseQuery(
      z.object({
        entity: z.string().optional(),
        action: z.string().optional(),
        userId: z.string().optional(),
        search: z.string().optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        page: z.coerce.number().optional(),
        pageSize: z.coerce.number().optional(),
      }),
      req,
    );
    const { skip, take, page, pageSize } = pagination(query);
    const where = {
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.search
        ? {
            OR: [
              { action: { contains: query.search, mode: 'insensitive' as const } },
              { entity: { contains: query.search, mode: 'insensitive' as const } },
              { entityId: { contains: query.search, mode: 'insensitive' as const } },
              { user: { name: { contains: query.search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { name: true, email: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.auditLog.count({ where }),
    ]);
    res.json({ data, total, page, pageSize });
  }),
);

// GET /api/admin/backup — full JSON data export (downloadable backup)
adminRouter.get(
  '/backup',
  ah(async (_req, res) => {
    const backup = {
      exportedAt: new Date().toISOString(),
      users: await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          phone: true,
          isActive: true,
          createdAt: true,
        },
      }),
      students: await prisma.studentProfile.findMany(),
      teachers: await prisma.teacherProfile.findMany(),
      parents: await prisma.parentProfile.findMany(),
      academicYears: await prisma.academicYear.findMany(),
      semesters: await prisma.semester.findMany(),
      classes: await prisma.classRoom.findMany(),
      subjects: await prisma.subject.findMany(),
      components: await prisma.assessmentComponent.findMany(),
      assignments: await prisma.teacherAssignment.findMany(),
      enrollments: await prisma.enrollment.findMany(),
      gradeEntries: await prisma.gradeEntry.findMany(),
      subjectResults: await prisma.subjectResult.findMany(),
      gpaRecords: await prisma.gPARecord.findMany(),
      gradeScales: await prisma.gradeScale.findMany({ include: { bands: true } }),
      reportCards: await prisma.reportCard.findMany(),
      notifications: await prisma.notification.findMany(),
      auditLogs: await prisma.auditLog.findMany(),
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="sgs_backup_${Date.now()}.json"`);
    res.send(JSON.stringify(backup, null, 2));
  }),
);
