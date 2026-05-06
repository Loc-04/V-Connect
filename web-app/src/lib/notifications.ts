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
  data: Record<string, unknown> | null;
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
  const data = record.data && typeof record.data === 'object' && !Array.isArray(record.data) ? record.data : null;

  return {
    id: record.id,
    type: normalizeNotificationType(record.type),
    title: record.title,
    description: record.message,
    timestamp: record.created_at ?? new Date().toISOString(),
    read: Boolean(record.read_at),
    data,
  };
}

export type NotificationWorkspace = 'volunteer' | 'organizer';

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getDataString(data: Record<string, unknown> | null, ...keys: string[]) {
  if (!data) {
    return '';
  }

  for (const key of keys) {
    const value = normalizeString(data[key]);
    if (value) {
      return value;
    }
  }
  return '';
}

function buildPathWithActivityId(basePath: string, activityId: string) {
  const normalizedActivityId = normalizeString(activityId);
  if (!normalizedActivityId) {
    return basePath;
  }
  return `${basePath}?activityId=${encodeURIComponent(normalizedActivityId)}`;
}

function isTruthyFlag(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = normalizeString(value).toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

export function resolveNotificationPath(
  notification: NotificationEntry,
  workspace: NotificationWorkspace
): string {
  const data = notification.data;
  const activityId = getDataString(data, 'activityId', 'activity_id');
  const status = getDataString(data, 'status').toLowerCase();
  const source = getDataString(data, 'source').toLowerCase();
  const activityDeleted = isTruthyFlag(data?.activityDeleted);
  const deletedByAdmin = isTruthyFlag(data?.deletedByAdmin);

  if (workspace === 'organizer') {
    if (notification.type === 'security') {
      return '/organizer/settings';
    }

    if (deletedByAdmin || activityDeleted) {
      return buildPathWithActivityId('/organizer/activities', activityId);
    }

    if (source === 'recommendation-assignment') {
      return buildPathWithActivityId('/organizer/recommendations', activityId);
    }

    if (status === 'checked_in') {
      return buildPathWithActivityId('/organizer/checkins', activityId);
    }

    if (status === 'pending' || status === 'approved' || status === 'rejected' || status === 'assigned' || status === 'cancelled') {
      return buildPathWithActivityId('/organizer/registrations', activityId);
    }

    if (notification.type === 'feedback') {
      return buildPathWithActivityId('/organizer/feedback', activityId);
    }

    if (activityId) {
      return buildPathWithActivityId('/organizer/activities', activityId);
    }

    return '/organizer/notifications';
  }

  if (notification.type === 'security') {
    return '/volunteer/profile-settings';
  }

  if (activityDeleted) {
    return '/volunteer/participation-history';
  }

  if (status === 'checked_in' || status === 'completed' || status === 'cancelled') {
    return '/volunteer/participation-history';
  }

  if (notification.type === 'feedback') {
    return '/volunteer/feedback';
  }

  if (notification.type === 'certificate') {
    return '/volunteer/participation-history';
  }

  if (activityId) {
    return `/volunteer/activity/${encodeURIComponent(activityId)}`;
  }

  return '/volunteer/notifications';
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
