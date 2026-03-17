import { Router } from 'express';
import { notificationColumns } from '../config/constants.js';
import { supabaseAdmin } from '../database/supabase.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { normalizeNotificationPayload } from './notifications.validation.js';

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
    let query = supabaseAdmin
      .from('notifications')
      .select(notificationColumns)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      query = query.is('read_at', null);
    }

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ message: error.message });
      return;
    }

    res.json({ notifications: data ?? [] });
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

  const now = new Date().toISOString();
  const insertPayload = {
    user_id: targetUserId,
    title: payload.title,
    message: payload.message,
    type: payload.type,
    data: payload.data,
    created_at: now,
  };

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .insert(insertPayload)
    .select(notificationColumns)
    .maybeSingle();

  if (error) {
    res.status(500).json({ message: error.message });
    return;
  }

  res.status(201).json({ notification: data });
});

export default router;
