import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import { normalizeNotificationPayload } from './notifications.validation.js';
import {
  clearNotifications,
  createNotificationRecord,
  ensureUpcomingActivityReminders,
  listNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from './notifications.service.js';

const router = Router();

router.get('/notifications', requireAuth, async (req, res) => {
  const requestedLimit = Number(req.query.limit ?? 50);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 200)
    : 50;
  const unreadOnly = String(req.query.unread ?? 'false').toLowerCase() === 'true';
  const role = String(req.auth?.profile?.role ?? '');
  const requestedUserId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
  const userId = role === 'admin' && requestedUserId ? requestedUserId : req.auth.user.id;

  try {
    try {
      await ensureUpcomingActivityReminders({
        userId,
        role,
      });
    } catch (reminderError) {
      const message = reminderError instanceof Error ? reminderError.message : String(reminderError);
      console.error(`Failed to sync upcoming activity reminders: ${message}`);
    }

    const notifications = await listNotifications({
      userId,
      limit,
      unreadOnly,
    });
    res.json({ notifications });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load notifications.';
    res.status(500).json({ message });
  }
});

router.post('/notifications', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '');
  const canCreate = role === 'admin' || role === 'organizer';
  if (!canCreate) {
    res.status(403).json({ message: 'Organizer or admin role required.' });
    return;
  }

  let payload;
  try {
    payload = normalizeNotificationPayload(req.body);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid payload.' });
    return;
  }

  const targetUserId = payload.userId || req.auth.user.id;
  if (!targetUserId) {
    res.status(400).json({ message: 'userId is required.' });
    return;
  }

  try {
    const notification = await createNotificationRecord({
      userId: targetUserId,
      title: payload.title,
      message: payload.message,
      type: payload.type,
      data: payload.data,
    });

    res.status(201).json({ notification });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create notification.';
    res.status(500).json({ message });
  }
});

router.patch('/notifications/read-all', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '');
  const requestedUserId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
  const userId = role === 'admin' && requestedUserId ? requestedUserId : req.auth.user.id;

  try {
    const count = await markAllNotificationsAsRead({ userId });
    res.json({ count });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to mark all notifications as read.';
    res.status(500).json({ message });
  }
});

router.patch('/notifications/:id/read', requireAuth, async (req, res) => {
  const notificationId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!notificationId) {
    res.status(400).json({ message: 'Notification id is required.' });
    return;
  }

  try {
    const notification = await markNotificationAsRead({
      notificationId,
      userId: req.auth.user.id,
      isAdmin: String(req.auth?.profile?.role ?? '') === 'admin',
    });
    res.json({ notification });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to mark notification as read.';
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 500;
    res.status(statusCode).json({ message });
  }
});

router.delete('/notifications', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '');
  const requestedUserId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
  const userId = role === 'admin' && requestedUserId ? requestedUserId : req.auth.user.id;

  try {
    const count = await clearNotifications({ userId });
    res.json({ count });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to clear notifications.';
    res.status(500).json({ message });
  }
});

export default router;
