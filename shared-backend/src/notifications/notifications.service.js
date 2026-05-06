import { notificationColumns } from '../config/constants.js';
import { supabaseAdmin } from '../database/supabase.js';

const reminderSource = 'activity-start-reminder';
const reminderStatuses = ['assigned', 'pending', 'approved'];
const reminderWindowMinutesDefault = 120;

function isFiniteTimestamp(value) {
  return Number.isFinite(value) && !Number.isNaN(value);
}

function formatReminderTimeLabel(isoString) {
  const date = new Date(isoString);
  if (!isFiniteTimestamp(date.getTime())) {
    return 'thoi gian sap toi';
  }

  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function buildReminderKey(activityId, startTime) {
  return `${reminderSource}:${activityId}:${startTime}`;
}

async function listVolunteerReminderCandidates({ userId, windowStartIso, windowEndIso }) {
  const { data: participations, error: participationsError } = await supabaseAdmin
    .from('activity_participations')
    .select('activity_id, status')
    .eq('volunteer_id', userId)
    .in('status', reminderStatuses)
    .order('created_at', { ascending: false })
    .limit(300);

  if (participationsError) {
    throw new Error(participationsError.message);
  }

  const activityIds = Array.from(
    new Set(
      (participations ?? [])
        .map((row) => (typeof row.activity_id === 'string' ? row.activity_id : ''))
        .filter((id) => id.length > 0)
    )
  );

  if (activityIds.length === 0) {
    return [];
  }

  const { data: activities, error: activitiesError } = await supabaseAdmin
    .from('activities')
    .select('id, title, start_time, status, deleted_at')
    .in('id', activityIds)
    .is('deleted_at', null)
    .gte('start_time', windowStartIso)
    .lte('start_time', windowEndIso)
    .neq('status', 'cancelled')
    .neq('status', 'completed');

  if (activitiesError) {
    throw new Error(activitiesError.message);
  }

  const activityById = new Map((activities ?? []).map((activity) => [activity.id, activity]));
  return (participations ?? [])
    .map((participation) => {
      const activity = activityById.get(participation.activity_id);
      if (!activity || !activity.start_time) {
        return null;
      }
      return {
        activityId: activity.id,
        activityTitle: String(activity.title ?? '').trim() || 'Hoat dong',
        startTime: activity.start_time,
        participantStatus: String(participation.status ?? '').trim().toLowerCase() || null,
      };
    })
    .filter(Boolean);
}

async function listOrganizerReminderCandidates({ userId, windowStartIso, windowEndIso }) {
  const { data, error } = await supabaseAdmin
    .from('activities')
    .select('id, title, start_time, status')
    .eq('organizer_id', userId)
    .is('deleted_at', null)
    .gte('start_time', windowStartIso)
    .lte('start_time', windowEndIso)
    .neq('status', 'cancelled')
    .neq('status', 'completed')
    .limit(150);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? [])
    .map((activity) => ({
      activityId: activity.id,
      activityTitle: String(activity.title ?? '').trim() || 'Hoat dong',
      startTime: activity.start_time,
      participantStatus: null,
    }))
    .filter((item) => typeof item.activityId === 'string' && item.activityId.length > 0 && Boolean(item.startTime));
}

async function listReminderKeysForUser({ userId, fromIso }) {
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('data')
    .eq('user_id', userId)
    .gte('created_at', fromIso)
    .limit(600);

  if (error) {
    throw new Error(error.message);
  }

  const keys = new Set();
  for (const row of data ?? []) {
    const payload = row?.data;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      continue;
    }
    const source = typeof payload.source === 'string' ? payload.source : '';
    const reminderKey = typeof payload.reminderKey === 'string' ? payload.reminderKey : '';
    if (source === reminderSource && reminderKey) {
      keys.add(reminderKey);
    }
  }
  return keys;
}

async function ensureUpcomingActivityReminders({
  userId,
  role,
  windowMinutes = reminderWindowMinutesDefault,
}) {
  const normalizedRole = String(role ?? '').trim().toLowerCase();
  if (!userId || (normalizedRole !== 'volunteer' && normalizedRole !== 'organizer')) {
    return 0;
  }

  const now = new Date();
  const nowTs = now.getTime();
  if (!isFiniteTimestamp(nowTs)) {
    return 0;
  }

  const safeWindowMinutes = Number.isFinite(windowMinutes)
    ? Math.max(5, Math.min(Math.trunc(windowMinutes), 24 * 60))
    : reminderWindowMinutesDefault;
  const windowEnd = new Date(nowTs + safeWindowMinutes * 60 * 1000);
  const windowStartIso = now.toISOString();
  const windowEndIso = windowEnd.toISOString();
  const dedupeFromIso = new Date(nowTs - 7 * 24 * 60 * 60 * 1000).toISOString();

  const candidates =
    normalizedRole === 'volunteer'
      ? await listVolunteerReminderCandidates({ userId, windowStartIso, windowEndIso })
      : await listOrganizerReminderCandidates({ userId, windowStartIso, windowEndIso });

  if (candidates.length === 0) {
    return 0;
  }

  const existingKeys = await listReminderKeysForUser({ userId, fromIso: dedupeFromIso });
  const uniqueByKey = new Map();
  for (const candidate of candidates) {
    const reminderKey = buildReminderKey(candidate.activityId, candidate.startTime);
    if (existingKeys.has(reminderKey)) {
      continue;
    }
    if (!uniqueByKey.has(reminderKey)) {
      uniqueByKey.set(reminderKey, { ...candidate, reminderKey });
    }
  }

  const newCandidates = [...uniqueByKey.values()];
  if (newCandidates.length === 0) {
    return 0;
  }

  const nowIso = new Date().toISOString();
  const insertPayload = newCandidates.map((candidate) => ({
    user_id: userId,
    title: 'Nhac nho hoat dong sap bat dau',
    message: `"${candidate.activityTitle}" se bat dau luc ${formatReminderTimeLabel(candidate.startTime)}.`,
    type: 'opportunity',
    data: {
      activityId: candidate.activityId,
      startTime: candidate.startTime,
      source: reminderSource,
      reminderKey: candidate.reminderKey,
      status: candidate.participantStatus ?? 'upcoming',
    },
    created_at: nowIso,
  }));

  const { error: insertError } = await supabaseAdmin.from('notifications').insert(insertPayload);
  if (insertError) {
    throw new Error(insertError.message);
  }

  return insertPayload.length;
}

async function listNotifications({ userId, limit = 50, unreadOnly = false }) {
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
    throw new Error(error.message);
  }

  return data ?? [];
}

async function listNotificationsForAdmin({ limit = 50, unreadOnly = false, userId = '', type = '' }) {
  let query = supabaseAdmin
    .from('notifications')
    .select(notificationColumns)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  if (type) {
    query = query.eq('type', type);
  }

  if (unreadOnly) {
    query = query.is('read_at', null);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function getNotificationById(notificationId) {
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select(notificationColumns)
    .eq('id', notificationId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}

async function createNotificationRecord({ userId, title, message, type = 'info', data = {} }) {
  const payload = {
    user_id: userId,
    title,
    message,
    type,
    data,
    created_at: new Date().toISOString(),
  };

  const { data: inserted, error } = await supabaseAdmin
    .from('notifications')
    .insert(payload)
    .select(notificationColumns)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return inserted ?? null;
}

async function updateNotificationRecord({ notificationId, updates }) {
  const notification = await getNotificationById(notificationId);
  if (!notification) {
    const error = new Error('Notification not found.');
    error.statusCode = 404;
    throw error;
  }

  const dbUpdates = {};

  if (Object.hasOwn(updates, 'userId')) {
    dbUpdates.user_id = updates.userId;
  }
  if (Object.hasOwn(updates, 'title')) {
    dbUpdates.title = updates.title;
  }
  if (Object.hasOwn(updates, 'message')) {
    dbUpdates.message = updates.message;
  }
  if (Object.hasOwn(updates, 'type')) {
    dbUpdates.type = updates.type;
  }
  if (Object.hasOwn(updates, 'data')) {
    dbUpdates.data = updates.data;
  }
  if (Object.hasOwn(updates, 'readAt')) {
    dbUpdates.read_at = updates.readAt;
  }

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .update(dbUpdates)
    .eq('id', notificationId)
    .select(notificationColumns)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? notification;
}

async function markNotificationAsRead({ notificationId, userId, isAdmin = false }) {
  const notification = await getNotificationById(notificationId);
  if (!notification) {
    const error = new Error('Notification not found.');
    error.statusCode = 404;
    throw error;
  }

  if (!isAdmin && notification.user_id !== userId) {
    const error = new Error('You do not have access to this notification.');
    error.statusCode = 403;
    throw error;
  }

  if (notification.read_at) {
    return notification;
  }

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .update({
      read_at: new Date().toISOString(),
    })
    .eq('id', notificationId)
    .select(notificationColumns)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? notification;
}

async function markAllNotificationsAsRead({ userId }) {
  const { error } = await supabaseAdmin
    .from('notifications')
    .update({
      read_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) {
    throw new Error(error.message);
  }

  const { count, error: countError } = await supabaseAdmin
    .from('notifications')
    .select('*', { head: true, count: 'exact' })
    .eq('user_id', userId)
    .not('read_at', 'is', null);

  if (countError) {
    throw new Error(countError.message);
  }

  return count ?? 0;
}

async function clearNotifications({ userId }) {
  const { data, error: existingError } = await supabaseAdmin
    .from('notifications')
    .select('id')
    .eq('user_id', userId);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const ids = (data ?? []).map((row) => row.id).filter(Boolean);
  if (ids.length === 0) {
    return 0;
  }

  const { error } = await supabaseAdmin.from('notifications').delete().in('id', ids);
  if (error) {
    throw new Error(error.message);
  }

  return ids.length;
}

async function deleteNotificationRecord(notificationId) {
  const notification = await getNotificationById(notificationId);
  if (!notification) {
    const error = new Error('Notification not found.');
    error.statusCode = 404;
    throw error;
  }

  const { error } = await supabaseAdmin.from('notifications').delete().eq('id', notificationId);
  if (error) {
    throw new Error(error.message);
  }

  return notification;
}

export {
  clearNotifications,
  createNotificationRecord,
  deleteNotificationRecord,
  ensureUpcomingActivityReminders,
  getNotificationById,
  listNotifications,
  listNotificationsForAdmin,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  updateNotificationRecord,
};
