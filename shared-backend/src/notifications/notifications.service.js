import { notificationColumns } from '../config/constants.js';
import { supabaseAdmin } from '../database/supabase.js';

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

export {
  clearNotifications,
  createNotificationRecord,
  getNotificationById,
  listNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
};
