import { apiRequest } from './api';

export type AdminNotificationType =
  | 'info'
  | 'message'
  | 'approval'
  | 'feedback'
  | 'opportunity'
  | 'certificate'
  | 'security'
  | string;

export interface AdminNotificationRecord {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: AdminNotificationType;
  data: Record<string, unknown>;
  createdAt: string | null;
  readAt: string | null;
}

interface NotificationRecordResponse {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string | null;
  data: Record<string, unknown> | null;
  created_at: string | null;
  read_at: string | null;
}

interface AdminNotificationsResponse {
  notifications: NotificationRecordResponse[];
}

interface AdminNotificationResponse {
  notification: NotificationRecordResponse;
}

interface AdminNotificationDeleteResponse {
  success: boolean;
  notification: NotificationRecordResponse;
}

export interface AdminNotificationFilters {
  limit?: number;
  unread?: boolean;
  userId?: string;
  type?: string;
}

export interface AdminNotificationPayload {
  userId: string;
  title: string;
  message: string;
  type?: string;
  data?: Record<string, unknown>;
  readAt?: string | null;
}

function normalizeAdminNotification(record: NotificationRecordResponse): AdminNotificationRecord {
  return {
    id: record.id,
    userId: record.user_id,
    title: record.title,
    message: record.message,
    type: String(record.type ?? 'info').trim().toLowerCase() || 'info',
    data: record.data ?? {},
    createdAt: record.created_at ?? null,
    readAt: record.read_at ?? null,
  };
}

function buildQueryString(filters: AdminNotificationFilters) {
  const query = new URLSearchParams();

  if (typeof filters.limit === 'number' && Number.isFinite(filters.limit)) {
    query.set('limit', String(Math.trunc(filters.limit)));
  }
  if (typeof filters.unread === 'boolean') {
    query.set('unread', String(filters.unread));
  }
  if (filters.userId) {
    query.set('userId', filters.userId);
  }
  if (filters.type) {
    query.set('type', filters.type);
  }

  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}

export async function getAdminNotifications(
  accessToken: string,
  filters: AdminNotificationFilters = {}
): Promise<AdminNotificationRecord[]> {
  const response = await apiRequest<AdminNotificationsResponse>(
    `/admin/notifications${buildQueryString(filters)}`,
    { accessToken }
  );

  return (response.notifications ?? []).map(normalizeAdminNotification);
}

export async function createAdminNotification(
  payload: AdminNotificationPayload,
  accessToken: string
): Promise<AdminNotificationRecord> {
  const response = await apiRequest<AdminNotificationResponse>('/admin/notifications', {
    method: 'POST',
    accessToken,
    body: {
      userId: payload.userId,
      title: payload.title,
      message: payload.message,
      type: payload.type ?? 'info',
      data: payload.data ?? {},
    },
  });

  return normalizeAdminNotification(response.notification);
}

export async function updateAdminNotification(
  notificationId: string,
  payload: Partial<AdminNotificationPayload>,
  accessToken: string
): Promise<AdminNotificationRecord> {
  const response = await apiRequest<AdminNotificationResponse>(`/admin/notifications/${notificationId}`, {
    method: 'PUT',
    accessToken,
    body: payload,
  });

  return normalizeAdminNotification(response.notification);
}

export async function deleteAdminNotification(
  notificationId: string,
  accessToken: string
): Promise<AdminNotificationRecord> {
  const response = await apiRequest<AdminNotificationDeleteResponse>(`/admin/notifications/${notificationId}`, {
    method: 'DELETE',
    accessToken,
  });

  return normalizeAdminNotification(response.notification);
}
