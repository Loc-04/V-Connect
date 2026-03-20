import { apiRequest } from './api';

export type NotificationType =
  | 'opportunity'
  | 'feedback'
  | 'approval'
  | 'certificate'
  | 'security'
  | 'message';

export interface NotificationEntry {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  timestamp: string;
  read: boolean;
}

interface NotificationRecord {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string | null;
  data: Record<string, unknown> | null;
  created_at: string | null;
  read_at: string | null;
}

interface NotificationsResponse {
  notifications: NotificationRecord[];
}

interface NotificationResponse {
  notification: NotificationRecord;
}

interface CountResponse {
  count: number;
}

function normalizeNotificationType(type: string | null | undefined): NotificationType {
  const normalized = String(type ?? '').trim().toLowerCase();
  if (
    normalized === 'opportunity' ||
    normalized === 'feedback' ||
    normalized === 'approval' ||
    normalized === 'certificate' ||
    normalized === 'security' ||
    normalized === 'message'
  ) {
    return normalized;
  }

  if (normalized === 'info') {
    return 'message';
  }

  return 'message';
}

function normalizeNotificationEntry(record: NotificationRecord): NotificationEntry {
  return {
    id: record.id,
    type: normalizeNotificationType(record.type),
    title: record.title,
    description: record.message,
    timestamp: record.created_at ?? new Date().toISOString(),
    read: Boolean(record.read_at),
  };
}

export async function getNotifications(accessToken: string, unreadOnly = false, limit = 50): Promise<NotificationEntry[]> {
  const query = new URLSearchParams({
    unread: String(unreadOnly),
    limit: String(Math.trunc(limit)),
  });

  const response = await apiRequest<NotificationsResponse>(`/notifications?${query.toString()}`, {
    accessToken,
  });

  return (response.notifications ?? []).map(normalizeNotificationEntry);
}

export async function markNotificationAsRead(accessToken: string, notificationId: string): Promise<NotificationEntry> {
  const response = await apiRequest<NotificationResponse>(`/notifications/${notificationId}/read`, {
    method: 'PATCH',
    accessToken,
  });

  return normalizeNotificationEntry(response.notification);
}

export async function markAllNotificationsAsRead(accessToken: string): Promise<number> {
  const response = await apiRequest<CountResponse>('/notifications/read-all', {
    method: 'PATCH',
    accessToken,
  });

  return response.count ?? 0;
}

export async function clearNotifications(accessToken: string): Promise<number> {
  const response = await apiRequest<CountResponse>('/notifications', {
    method: 'DELETE',
    accessToken,
  });

  return response.count ?? 0;
}
