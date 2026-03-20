import { Router } from 'express';
import { activityColumns, validActivityStatuses } from '../config/constants.js';
import { supabaseAdmin } from '../database/supabase.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { createNotificationRecord } from '../notifications/notifications.service.js';
import { normalizeActivityPayload } from './activities.validation.js';
import { canWriteActivities, getActivityById } from './activities.service.js';

const router = Router();

async function tryCreateNotification(payload) {
  try {
    await createNotificationRecord(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Notification create failed: ${message}`);
  }
}

async function handleActivityDetail(req, res) {
  const activityId = req.params.id;

  let data;
  try {
    data = await getActivityById(activityId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load activity.';
    res.status(500).json({ message });
    return;
  }

  if (!data) {
    res.status(404).json({ message: 'Activity not found.' });
    return;
  }

  const role = String(req.auth?.profile?.role ?? '');
  const isOwner = data.organizer_id === req.auth.user.id;
  const canAccess = data.status === 'published' || isOwner || role === 'admin';
  if (!canAccess) {
    res.status(403).json({ message: 'You do not have permission to access this activity.' });
    return;
  }

  res.json({ activity: data });
}

router.get('/activities', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '');
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const mine = String(req.query.mine ?? 'false').toLowerCase() === 'true';
  const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : 'all';
  const requestedLimit = Number(req.query.limit ?? 24);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
    : 24;

  if (statusFilter !== 'all' && !validActivityStatuses.has(statusFilter)) {
    res.status(400).json({
      message: `Invalid status filter. Allowed: all, ${Array.from(validActivityStatuses).join(', ')}`,
    });
    return;
  }

  if (mine && !canWriteActivities(role)) {
    res.status(403).json({ message: 'Only organizers/admins can query own activities.' });
    return;
  }

  let query = supabaseAdmin
    .from('activities')
    .select(activityColumns)
    .is('deleted_at', null)
    .order('start_time', { ascending: true })
    .limit(limit);

  if (mine) {
    if (role !== 'admin') {
      query = query.eq('organizer_id', req.auth.user.id);
    }
    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }
  } else if (role === 'volunteer') {
    query = query.eq('status', 'published');
  } else if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  } else {
    query = query.eq('status', 'published');
  }

  if (search) {
    query = query.ilike('title', `%${search}%`);
  }

  const { data, error } = await query;
  if (error) {
    res.status(500).json({ message: error.message });
    return;
  }

  res.json({ activities: data ?? [] });
});

router.get('/activities/:id', requireAuth, handleActivityDetail);
router.get('/activity/:id', requireAuth, handleActivityDetail);

router.post('/activities', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '');
  if (!canWriteActivities(role)) {
    res.status(403).json({ message: 'Organizer or admin role required.' });
    return;
  }

  let payload;
  try {
    payload = normalizeActivityPayload(req.body, { partial: false });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid payload.' });
    return;
  }

  const now = new Date().toISOString();
  const createPayload = {
    ...payload,
    organizer_id: req.auth.user.id,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabaseAdmin
    .from('activities')
    .insert(createPayload)
    .select(activityColumns)
    .maybeSingle();

  if (error) {
    if (error.code === '23514' || error.code === '22P02' || error.code === '23502') {
      res.status(400).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: error.message });
    return;
  }

  res.status(201).json({ activity: data });
});

router.patch('/activities/:id', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '');
  if (!canWriteActivities(role)) {
    res.status(403).json({ message: 'Organizer or admin role required.' });
    return;
  }

  const activityId = req.params.id;
  const { data: existingActivity, error: existingError } = await supabaseAdmin
    .from('activities')
    .select(activityColumns)
    .eq('id', activityId)
    .is('deleted_at', null)
    .maybeSingle();

  if (existingError) {
    res.status(500).json({ message: existingError.message });
    return;
  }

  if (!existingActivity) {
    res.status(404).json({ message: 'Activity not found.' });
    return;
  }

  if (role !== 'admin' && existingActivity.organizer_id !== req.auth.user.id) {
    res.status(403).json({ message: 'You can update only your own activities.' });
    return;
  }

  let payload;
  try {
    payload = normalizeActivityPayload(req.body, { partial: true });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid payload.' });
    return;
  }

  const mergedStartTime = payload.start_time ?? existingActivity.start_time;
  const mergedEndTime = payload.end_time ?? existingActivity.end_time;
  if (mergedStartTime && mergedEndTime && new Date(mergedEndTime) <= new Date(mergedStartTime)) {
    res.status(400).json({ message: 'endTime must be later than startTime.' });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('activities')
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', activityId)
    .is('deleted_at', null)
    .select(activityColumns)
    .maybeSingle();

  if (error) {
    if (error.code === '23514' || error.code === '22P02' || error.code === '23502') {
      res.status(400).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: error.message });
    return;
  }

  if (!data) {
    res.status(404).json({ message: 'Activity not found.' });
    return;
  }

  res.json({ activity: data });
});

router.delete('/activities/:id', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '');
  if (!canWriteActivities(role)) {
    res.status(403).json({ message: 'Organizer or admin role required.' });
    return;
  }

  const activityId = req.params.id;

  const { data: existingActivity, error: existingError } = await supabaseAdmin
    .from('activities')
    .select('id, organizer_id, title')
    .eq('id', activityId)
    .is('deleted_at', null)
    .maybeSingle();

  if (existingError) {
    res.status(500).json({ message: existingError.message });
    return;
  }

  if (!existingActivity) {
    res.status(404).json({ message: 'Activity not found.' });
    return;
  }

  if (role !== 'admin' && existingActivity.organizer_id !== req.auth.user.id) {
    res.status(403).json({ message: 'You can delete only your own activities.' });
    return;
  }

  const { data: registrations, error: registrationsError } = await supabaseAdmin
    .from('activity_participations')
    .select('id, volunteer_id, status')
    .eq('activity_id', activityId);

  if (registrationsError) {
    res.status(500).json({ message: registrationsError.message });
    return;
  }

  const registrationsToCancel = (registrations ?? []).filter((registration) => {
    const status = String(registration.status ?? '').toLowerCase();
    return status === 'pending' || status === 'approved';
  });

  if (registrationsToCancel.length > 0) {
    const { error: cancelRegistrationsError } = await supabaseAdmin
      .from('activity_participations')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .in(
        'id',
        registrationsToCancel
          .map((registration) => registration.id)
          .filter((id) => typeof id === 'string' && id.length > 0)
      );

    if (cancelRegistrationsError) {
      res.status(500).json({ message: cancelRegistrationsError.message });
      return;
    }
  }

  const { error } = await supabaseAdmin
    .from('activities')
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', activityId)
    .is('deleted_at', null);

  if (error) {
    res.status(500).json({ message: error.message });
    return;
  }

  const activeOrCompletedRegistrations = Array.from(
    new Map(
      (registrations ?? [])
        .filter((registration) => {
          const status = String(registration.status ?? '').toLowerCase();
          return Boolean(registration.volunteer_id) && status !== 'cancelled' && status !== 'rejected';
        })
        .map((registration) => [registration.volunteer_id, registration])
    ).values()
  );

  await Promise.all(
    activeOrCompletedRegistrations.map((registration) => {
      const status = String(registration.status ?? '').toLowerCase();
      const isCompletedRecord = status === 'checked_in';

      return tryCreateNotification({
        userId: registration.volunteer_id,
        title: 'Activity Removed',
        message: isCompletedRecord
          ? `The organizer removed "${existingActivity.title}". Your completed participation record has been preserved in history.`
          : `The organizer removed "${existingActivity.title}". Your registration is no longer active, and the record has been preserved in history.`,
        type: 'message',
        data: {
          activityId,
          registrationId: registration.id,
          status: isCompletedRecord ? 'completed' : 'cancelled',
          activityDeleted: true,
        },
      });
    })
  );

  res.json({ success: true, message: 'Activity deleted successfully.' });
});

export default router;
