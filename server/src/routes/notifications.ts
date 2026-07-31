import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { ah } from '../lib/helpers';
import { authenticate } from '../middleware/auth';

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get('/', ah(async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  const unreadCount = await prisma.notification.count({
    where: { userId: req.user!.id, isRead: false },
  });
  res.json({ data: notifications, unreadCount });
}));

notificationsRouter.patch('/:id/read', ah(async (req, res) => {
  await prisma.notification.updateMany({
    where: { id: req.params.id, userId: req.user!.id },
    data: { isRead: true },
  });
  res.json({ success: true });
}));

notificationsRouter.patch('/read-all', ah(async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user!.id, isRead: false },
    data: { isRead: true },
  });
  res.json({ success: true });
}));

// DELETE /api/notifications/:id — remove a single notification (own only)
notificationsRouter.delete('/:id', ah(async (req, res) => {
  const result = await prisma.notification.deleteMany({
    where: { id: req.params.id, userId: req.user!.id },
  });
  if (result.count === 0) throw AppError.notFound('Notification');
  res.json({ success: true });
}));

// DELETE /api/notifications — clear all of the signed-in user's notifications
notificationsRouter.delete('/', ah(async (req, res) => {
  const result = await prisma.notification.deleteMany({ where: { userId: req.user!.id } });
  res.json({ success: true, deleted: result.count });
}));
