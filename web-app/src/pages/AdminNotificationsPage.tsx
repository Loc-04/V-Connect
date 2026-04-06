import { Bell, CheckCheck, Mail, RefreshCw, Search, Trash2 } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../auth/useAuth';
import { Button } from '../components/ui';
import {
  createAdminNotification,
  deleteAdminNotification,
  getAdminNotifications,
  updateAdminNotification,
  type AdminNotificationRecord,
} from '../lib/adminNotifications';
import { apiRequest } from '../lib/api';
import type { UserRecord } from '../types/domain';
import './AdminNotificationsPage.css';

interface AdminUsersResponse {
  users: UserRecord[];
}

interface NotificationFormState {
  userId: string;
  title: string;
  message: string;
  type: string;
  dataJson: string;
  markAsRead: boolean;
}

const DEFAULT_FORM: NotificationFormState = {
  userId: '',
  title: '',
  message: '',
  type: 'info',
  dataJson: JSON.stringify({ source: 'admin-panel' }, null, 2),
  markAsRead: false,
};
const NOTIFICATIONS_PER_PAGE = 8;

function formatRelativeTime(value: string | null): string {
  if (!value) {
    return 'Just now';
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return 'Recently';
  }

  const diffMs = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return 'Just now';
  }
  if (diffMs < hour) {
    return `${Math.floor(diffMs / minute)}m ago`;
  }
  if (diffMs < day) {
    return `${Math.floor(diffMs / hour)}h ago`;
  }

  return `${Math.floor(diffMs / day)}d ago`;
}

function normalizeText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function formatUserLabel(user: UserRecord): string {
  const fullName = user.full_name?.trim() || 'Unnamed user';
  const role = user.role?.toString().trim() || 'unknown';
  const phone = user.phone?.trim();
  return phone ? `${fullName} (${role}) - ${phone}` : `${fullName} (${role})`;
}

function findUserById(users: UserRecord[], userId: string): UserRecord | null {
  return users.find((user) => user.id === userId) ?? null;
}

function buildFormFromNotification(notification: AdminNotificationRecord): NotificationFormState {
  return {
    userId: notification.userId,
    title: notification.title,
    message: notification.message,
    type: notification.type || 'info',
    dataJson: JSON.stringify(notification.data ?? {}, null, 2),
    markAsRead: Boolean(notification.readAt),
  };
}

function matchesNotificationSearch(notification: AdminNotificationRecord, keyword: string): boolean {
  if (!keyword) {
    return true;
  }

  return (
    normalizeText(notification.title).includes(keyword) ||
    normalizeText(notification.message).includes(keyword) ||
    normalizeText(notification.userId).includes(keyword) ||
    normalizeText(notification.type).includes(keyword)
  );
}

export function AdminNotificationsPage() {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? '';

  const [notifications, setNotifications] = useState<AdminNotificationRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [selectedNotificationId, setSelectedNotificationId] = useState<string | null>(null);
  const [form, setForm] = useState<NotificationFormState>(DEFAULT_FORM);
  const [userSearch, setUserSearch] = useState('');
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      setError('No active admin session token.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [nextNotifications, usersResponse] = await Promise.all([
        getAdminNotifications(accessToken, { limit: 200 }),
        apiRequest<AdminUsersResponse>('/admin/users', { accessToken }),
      ]);

      setNotifications(nextNotifications);
      setUsers(usersResponse.users ?? []);
      setSelectedNotificationId((current) =>
        current && nextNotifications.some((notification) => notification.id === current) ? current : null
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedNotification = useMemo(
    () => notifications.find((notification) => notification.id === selectedNotificationId) ?? null,
    [notifications, selectedNotificationId]
  );

  useEffect(() => {
    if (!selectedNotification) {
      setForm(DEFAULT_FORM);
      setUserSearch('');
      return;
    }

    setForm(buildFormFromNotification(selectedNotification));
    const selectedUser = findUserById(users, selectedNotification.userId);
    setUserSearch(selectedUser ? formatUserLabel(selectedUser) : selectedNotification.userId);
  }, [selectedNotification, users]);

  const availableTypes = useMemo(() => {
    const types = new Set<string>(['info', 'message', 'approval', 'feedback', 'opportunity', 'security']);
    for (const notification of notifications) {
      if (notification.type) {
        types.add(notification.type);
      }
    }
    return Array.from(types);
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    const keyword = normalizeText(searchTerm);
    return notifications.filter((notification) => {
      const matchesType = typeFilter === 'all' || notification.type === typeFilter;
      const matchesState =
        stateFilter === 'all' ||
        (stateFilter === 'read' ? Boolean(notification.readAt) : !notification.readAt);
      return matchesType && matchesState && matchesNotificationSearch(notification, keyword);
    });
  }, [notifications, searchTerm, typeFilter, stateFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, typeFilter, stateFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredNotifications.length / NOTIFICATIONS_PER_PAGE));

  useEffect(() => {
    setCurrentPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const pagedNotifications = useMemo(() => {
    const start = (currentPage - 1) * NOTIFICATIONS_PER_PAGE;
    return filteredNotifications.slice(start, start + NOTIFICATIONS_PER_PAGE);
  }, [currentPage, filteredNotifications]);

  const stats = useMemo(() => {
    const total = notifications.length;
    const unread = notifications.filter((notification) => !notification.readAt).length;
    return {
      total,
      unread,
      read: total - unread,
    };
  }, [notifications]);

  const selectedUser = useMemo(() => findUserById(users, form.userId), [users, form.userId]);

  const userOptions = useMemo(() => {
    const keyword = normalizeText(userSearch);
    return users
      .filter((user) => {
        if (!keyword) {
          return true;
        }

        return (
          normalizeText(user.full_name).includes(keyword) ||
          normalizeText(user.role).includes(keyword) ||
          normalizeText(user.phone).includes(keyword) ||
          normalizeText(user.id).includes(keyword)
        );
      })
      .slice(0, 8);
  }, [users, userSearch]);

  const setField = <K extends keyof NotificationFormState>(field: K, value: NotificationFormState[K]) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const switchToCreateMode = () => {
    setSelectedNotificationId(null);
    setForm(DEFAULT_FORM);
    setUserSearch('');
    setShowUserPicker(false);
    setError(null);
    setSuccess(null);
  };

  const handleSelectNotification = (notificationId: string) => {
    setSelectedNotificationId(notificationId);
    setShowUserPicker(false);
    setError(null);
    setSuccess(null);
  };

  const handleSelectUser = (user: UserRecord) => {
    setForm((current) => ({
      ...current,
      userId: user.id,
    }));
    setUserSearch(formatUserLabel(user));
    setShowUserPicker(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken) {
      setError('No active admin session token.');
      return;
    }

    let parsedData: Record<string, unknown>;
    try {
      const raw = form.dataJson.trim();
      parsedData = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      setError('Data JSON must be valid JSON.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      if (selectedNotification) {
        const updated = await updateAdminNotification(
          selectedNotification.id,
          {
            userId: form.userId,
            title: form.title,
            message: form.message,
            type: form.type,
            data: parsedData,
            readAt: form.markAsRead ? new Date().toISOString() : null,
          },
          accessToken
        );

        setNotifications((current) =>
          current.map((notification) => (notification.id === updated.id ? updated : notification))
        );
        setSelectedNotificationId(updated.id);
        setSuccess('Notification updated successfully.');
      } else {
        let created = await createAdminNotification(
          {
            userId: form.userId,
            title: form.title,
            message: form.message,
            type: form.type,
            data: parsedData,
          },
          accessToken
        );

        if (form.markAsRead) {
          created = await updateAdminNotification(
            created.id,
            { readAt: new Date().toISOString() },
            accessToken
          );
        }

        setNotifications((current) => [created, ...current]);
        setSelectedNotificationId(created.id);
        setSuccess('Notification created successfully.');
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to save notification.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (notificationId: string) => {
    if (!accessToken) {
      setError('No active admin session token.');
      return;
    }

    const confirmed = window.confirm('Delete this notification?');
    if (!confirmed) {
      return;
    }

    setDeletingId(notificationId);
    setError(null);
    setSuccess(null);

    try {
      await deleteAdminNotification(notificationId, accessToken);
      setNotifications((current) => current.filter((notification) => notification.id !== notificationId));
      if (selectedNotificationId === notificationId) {
        setSelectedNotificationId(null);
      }
      setSuccess('Notification deleted successfully.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete notification.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="admin-notifications-page">
      <div className="admin-notifications-header">
        <div>
          <p className="admin-notifications-kicker">Admin Notification Management</p>
          <h1>Notifications</h1>
          <p className="admin-notifications-copy">
            Create, update, review, and remove system notifications across all users.
          </p>
        </div>
        <div className="admin-notifications-actions">
          <Button onClick={switchToCreateMode} type="button">
            Create Notification
          </Button>
          <Button onClick={() => void loadData()} type="button" variant="secondary">
            <RefreshCw size={16} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="admin-notifications-stats">
        <article className="admin-notification-stat">
          <span className="admin-notification-stat-icon total">
            <Bell size={18} />
          </span>
          <div>
            <p>Total Notifications</p>
            <strong>{stats.total}</strong>
          </div>
        </article>
        <article className="admin-notification-stat">
          <span className="admin-notification-stat-icon unread">
            <Mail size={18} />
          </span>
          <div>
            <p>Unread</p>
            <strong>{stats.unread}</strong>
          </div>
        </article>
        <article className="admin-notification-stat">
          <span className="admin-notification-stat-icon read">
            <CheckCheck size={18} />
          </span>
          <div>
            <p>Read</p>
            <strong>{stats.read}</strong>
          </div>
        </article>
      </div>

      <div className="admin-notifications-grid">
        <div className="admin-notifications-list-card">
          <div className="admin-notifications-toolbar">
            <label className="admin-notifications-search">
              <Search size={18} />
              <input
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by title, user ID, type..."
                value={searchTerm}
              />
            </label>

            <div className="admin-notifications-filters">
              <select onChange={(event) => setTypeFilter(event.target.value)} value={typeFilter}>
                <option value="all">All types</option>
                {availableTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <select onChange={(event) => setStateFilter(event.target.value)} value={stateFilter}>
                <option value="all">All states</option>
                <option value="unread">Unread</option>
                <option value="read">Read</option>
              </select>
            </div>
          </div>

          {error && <p className="admin-notifications-alert error">{error}</p>}
          {success && <p className="admin-notifications-alert success">{success}</p>}

          <div className="admin-notifications-list">
            {loading ? (
              <p className="admin-notifications-empty">Loading notifications...</p>
            ) : filteredNotifications.length === 0 ? (
              <p className="admin-notifications-empty">No notifications match the current filters.</p>
            ) : (
              pagedNotifications.map((notification) => {
                const notificationUser = findUserById(users, notification.userId);
                const isSelected = notification.id === selectedNotificationId;

                return (
                  <article
                    className={isSelected ? 'admin-notification-item active' : 'admin-notification-item'}
                    key={notification.id}
                    onClick={() => handleSelectNotification(notification.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleSelectNotification(notification.id);
                      }
                    }}
                  >
                    <div className="admin-notification-item-head">
                      <div>
                        <h3>{notification.title}</h3>
                        <p className="admin-notification-user">
                          {notificationUser ? formatUserLabel(notificationUser) : notification.userId}
                        </p>
                      </div>
                      <span
                        className={
                          notification.readAt
                            ? 'admin-notification-status read'
                            : 'admin-notification-status unread'
                        }
                      >
                        {notification.readAt ? 'Read' : 'Unread'}
                      </span>
                    </div>

                    <p className="admin-notification-message">{notification.message}</p>

                    <div className="admin-notification-meta">
                      <span className="admin-notification-type">{notification.type}</span>
                      <span>{formatRelativeTime(notification.createdAt)}</span>
                    </div>

                    <div className="admin-notification-row-actions">
                      <Button
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDelete(notification.id);
                        }}
                        type="button"
                        variant="danger"
                        disabled={deletingId === notification.id}
                      >
                        <Trash2 size={16} />
                        {deletingId === notification.id ? 'Deleting...' : 'Delete'}
                      </Button>
                    </div>
                  </article>
                );
              })
            )}
          </div>

          {!loading && filteredNotifications.length > 0 && (
            <div className="admin-notifications-pagination">
              <button
                className="admin-notifications-page-btn"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                Previous
              </button>
              <span className="admin-notifications-page-info">
                Page {currentPage} / {totalPages}
              </span>
              <button
                className="admin-notifications-page-btn"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((current) => Math.min(totalPages, current + 1))}
                type="button"
              >
                Next
              </button>
            </div>
          )}
        </div>

        <div className="admin-notifications-form-card">
          <div className="admin-notifications-form-head">
            <div>
              <h2>{selectedNotification ? 'Edit Notification' : 'Create Notification'}</h2>
              <p>
                {selectedNotification
                  ? 'Update the selected notification record.'
                  : 'Compose a notification for any target user.'}
              </p>
            </div>
            {selectedNotification && (
              <button className="admin-notifications-switch-link" onClick={switchToCreateMode} type="button">
                Switch to create
              </button>
            )}
          </div>

          <form className="admin-notifications-form" onSubmit={handleSubmit}>
            <div className="admin-notifications-field">
              <label htmlFor="admin-notification-user">Target user</label>
              <input
                id="admin-notification-user"
                onBlur={() => {
                  window.setTimeout(() => setShowUserPicker(false), 120);
                }}
                onChange={(event) => {
                  setUserSearch(event.target.value);
                  setField('userId', '');
                  setShowUserPicker(true);
                }}
                onFocus={() => setShowUserPicker(true)}
                placeholder="Search by name, role, phone, or UUID"
                value={userSearch}
              />
              {showUserPicker && userOptions.length > 0 && (
                <div className="admin-notifications-user-picker">
                  {userOptions.map((user) => (
                    <button
                      className="admin-notifications-user-option"
                      key={user.id}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        handleSelectUser(user);
                      }}
                      type="button"
                    >
                      <span>{formatUserLabel(user)}</span>
                      <small>{user.id}</small>
                    </button>
                  ))}
                </div>
              )}
              {form.userId && (
                <small className="admin-notifications-helper">
                  Selected UUID: <code>{form.userId}</code>
                </small>
              )}
            </div>

            <div className="admin-notifications-field-row">
              <div className="admin-notifications-field">
                <label htmlFor="admin-notification-type">Type</label>
                <select
                  id="admin-notification-type"
                  onChange={(event) => setField('type', event.target.value)}
                  value={form.type}
                >
                  {availableTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <label className="admin-notifications-checkbox">
                <input
                  checked={form.markAsRead}
                  onChange={(event) => setField('markAsRead', event.target.checked)}
                  type="checkbox"
                />
                Mark as read immediately
              </label>
            </div>

            <div className="admin-notifications-field">
              <label htmlFor="admin-notification-title">Title</label>
              <input
                id="admin-notification-title"
                onChange={(event) => setField('title', event.target.value)}
                placeholder="Notification title"
                value={form.title}
              />
            </div>

            <div className="admin-notifications-field">
              <label htmlFor="admin-notification-message">Message</label>
              <textarea
                id="admin-notification-message"
                onChange={(event) => setField('message', event.target.value)}
                placeholder="Compose the notification message..."
                rows={5}
                value={form.message}
              />
            </div>

            <div className="admin-notifications-field">
              <label htmlFor="admin-notification-data">Data JSON</label>
              <textarea
                id="admin-notification-data"
                onChange={(event) => setField('dataJson', event.target.value)}
                rows={7}
                value={form.dataJson}
              />
            </div>

            {selectedUser && (
              <div className="admin-notifications-recipient-card">
                <p className="admin-notifications-recipient-label">Recipient</p>
                <strong>{selectedUser.full_name ?? 'Unnamed user'}</strong>
                <span>{selectedUser.role}</span>
              </div>
            )}

            <div className="admin-notifications-form-actions">
              <Button disabled={submitting} type="submit">
                {submitting
                  ? selectedNotification
                    ? 'Saving...'
                    : 'Creating...'
                  : selectedNotification
                    ? 'Save changes'
                    : 'Create notification'}
              </Button>
              <Button onClick={switchToCreateMode} type="button" variant="secondary">
                Reset form
              </Button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
