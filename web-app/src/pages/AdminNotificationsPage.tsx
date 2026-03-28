import {
  BellRing,
  CheckCheck,
  Mail,
  Pencil,
  PlusCircle,
  RefreshCw,
  Search,
  Shield,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../auth/useAuth';
import { Button, Card, Select } from '../components/ui';
import {
  createAdminNotification,
  deleteAdminNotification,
  getAdminNotifications,
  updateAdminNotification,
  type AdminNotificationPayload,
  type AdminNotificationRecord,
} from '../lib/adminNotifications';
import './AdminNotificationsPage.css';

const PAGE_SIZE = 12;
const notificationTypeOptions = [
  'info',
  'message',
  'approval',
  'feedback',
  'opportunity',
  'certificate',
  'security',
] as const;

type NotificationMode = 'create' | 'edit';

interface NotificationDraft {
  userId: string;
  title: string;
  message: string;
  type: string;
  dataText: string;
  markRead: boolean;
}

const emptyDraft: NotificationDraft = {
  userId: '',
  title: '',
  message: '',
  type: 'info',
  dataText: '{\n  "source": "admin-panel"\n}',
  markRead: false,
};

function formatRelativeTime(value: string | null) {
  if (!value) {
    return 'Unknown time';
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return 'Unknown time';
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

function formatAbsoluteTime(value: string | null) {
  if (!value) {
    return '--';
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return '--';
  }

  return timestamp.toLocaleString();
}

function normalizeDraftFromNotification(notification: AdminNotificationRecord): NotificationDraft {
  return {
    userId: notification.userId,
    title: notification.title,
    message: notification.message,
    type: notification.type || 'info',
    dataText: JSON.stringify(notification.data ?? {}, null, 2),
    markRead: Boolean(notification.readAt),
  };
}

function parseDraftPayload(draft: NotificationDraft): AdminNotificationPayload {
  const userId = draft.userId.trim();
  const title = draft.title.trim();
  const message = draft.message.trim();

  if (!userId) {
    throw new Error('User ID is required.');
  }
  if (!title) {
    throw new Error('Title is required.');
  }
  if (!message) {
    throw new Error('Message is required.');
  }

  let parsedData: Record<string, unknown> = {};
  if (draft.dataText.trim()) {
    const parsed = JSON.parse(draft.dataText);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Data JSON must be an object.');
    }
    parsedData = parsed as Record<string, unknown>;
  }

  return {
    userId,
    title,
    message,
    type: draft.type || 'info',
    data: parsedData,
    readAt: draft.markRead ? new Date().toISOString() : null,
  };
}

function applyFilter(
  notifications: AdminNotificationRecord[],
  searchTerm: string,
  readFilter: 'all' | 'unread' | 'read'
) {
  const keyword = searchTerm.trim().toLowerCase();

  return notifications.filter((notification) => {
    const matchesKeyword =
      !keyword ||
      notification.id.toLowerCase().includes(keyword) ||
      notification.userId.toLowerCase().includes(keyword) ||
      notification.title.toLowerCase().includes(keyword) ||
      notification.message.toLowerCase().includes(keyword) ||
      notification.type.toLowerCase().includes(keyword);

    if (!matchesKeyword) {
      return false;
    }

    if (readFilter === 'unread') {
      return !notification.readAt;
    }
    if (readFilter === 'read') {
      return Boolean(notification.readAt);
    }

    return true;
  });
}

export function AdminNotificationsPage() {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? null;

  const [notifications, setNotifications] = useState<AdminNotificationRecord[]>([]);
  const [selectedNotificationId, setSelectedNotificationId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<NotificationMode>('create');
  const [draft, setDraft] = useState<NotificationDraft>(emptyDraft);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const loadNotifications = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      setError('No active session token.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const nextNotifications = await getAdminNotifications(accessToken, {
        limit: 200,
        unread: readFilter === 'unread' ? true : undefined,
        type: typeFilter === 'all' ? undefined : typeFilter,
      });
      setNotifications(nextNotifications);
      setSelectedNotificationId((current) =>
        current && nextNotifications.some((item) => item.id === current) ? current : nextNotifications[0]?.id ?? null
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load admin notifications.');
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken, readFilter, typeFilter]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [readFilter, searchTerm, typeFilter]);

  const filteredNotifications = useMemo(
    () => applyFilter(notifications, searchTerm, readFilter),
    [notifications, readFilter, searchTerm]
  );

  const visibleNotifications = filteredNotifications.slice(0, visibleCount);
  const hasMore = filteredNotifications.length > visibleCount;
  const selectedNotification =
    filteredNotifications.find((notification) => notification.id === selectedNotificationId) ??
    visibleNotifications[0] ??
    null;

  const stats = useMemo(
    () => ({
      total: notifications.length,
      unread: notifications.filter((item) => !item.readAt).length,
      read: notifications.filter((item) => Boolean(item.readAt)).length,
    }),
    [notifications]
  );

  const beginCreate = () => {
    setMode('create');
    setSelectedNotificationId(null);
    setDraft(emptyDraft);
    setError(null);
    setNotice(null);
  };

  const beginEdit = (notification: AdminNotificationRecord) => {
    setMode('edit');
    setSelectedNotificationId(notification.id);
    setDraft(normalizeDraftFromNotification(notification));
    setError(null);
    setNotice(null);
  };

  const handleDraftChange = (field: keyof NotificationDraft, value: string | boolean) => {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = async () => {
    if (!accessToken) {
      setError('No active session token.');
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const payload = parseDraftPayload(draft);

      if (mode === 'create') {
        const created = await createAdminNotification(payload, accessToken);
        setNotifications((current) => [created, ...current]);
        setSelectedNotificationId(created.id);
        setNotice('Notification created successfully.');
        setMode('edit');
        setDraft(normalizeDraftFromNotification(created));
      } else if (selectedNotificationId) {
        const updated = await updateAdminNotification(selectedNotificationId, payload, accessToken);
        setNotifications((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setSelectedNotificationId(updated.id);
        setNotice('Notification updated successfully.');
        setDraft(normalizeDraftFromNotification(updated));
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to save notification.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (notification: AdminNotificationRecord) => {
    if (!accessToken) {
      setError('No active session token.');
      return;
    }

    const confirmed = window.confirm(`Delete notification "${notification.title}"?`);
    if (!confirmed) {
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await deleteAdminNotification(notification.id, accessToken);
      setNotifications((current) => current.filter((item) => item.id !== notification.id));
      setNotice('Notification deleted successfully.');

      if (selectedNotificationId === notification.id) {
        setSelectedNotificationId(null);
        beginCreate();
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete notification.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="admin-notifications-page">
      <div className="users-page-head">
        <div>
          <p className="users-caption">Admin Notification Management</p>
          <h2>Notifications</h2>
          <p className="muted">Create, update, review, and remove system notifications across all users.</p>
        </div>
        <div className="admin-notifications-head-actions">
          <Button onClick={beginCreate} type="button">
            <PlusCircle size={15} />
            Create Notification
          </Button>
          <Button disabled={busy} onClick={() => void loadNotifications()} type="button" variant="secondary">
            <RefreshCw size={15} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="admin-notifications-stat-grid">
        <article className="admin-notifications-stat-card">
          <span className="admin-notifications-stat-icon is-total">
            <BellRing size={16} />
          </span>
          <p>Total Notifications</p>
          <strong>{stats.total}</strong>
        </article>
        <article className="admin-notifications-stat-card">
          <span className="admin-notifications-stat-icon is-unread">
            <Mail size={16} />
          </span>
          <p>Unread</p>
          <strong>{stats.unread}</strong>
        </article>
        <article className="admin-notifications-stat-card">
          <span className="admin-notifications-stat-icon is-read">
            <CheckCheck size={16} />
          </span>
          <p>Read</p>
          <strong>{stats.read}</strong>
        </article>
      </div>

      <div className="admin-notifications-grid">
        <Card as="section" className="admin-notifications-list-card">
          <div className="admin-notifications-toolbar">
            <label className="users-search-wrap admin-notifications-search">
              <Search aria-hidden="true" className="users-icon users-search-icon" />
              <input
                className="text-input users-search-input"
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by title, user ID, type..."
                value={searchTerm}
              />
            </label>

            <div className="admin-notifications-toolbar-filters">
              <Select onChange={(event) => setTypeFilter(event.target.value)} value={typeFilter}>
                <option value="all">All types</option>
                {notificationTypeOptions.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>

              <Select onChange={(event) => setReadFilter(event.target.value as 'all' | 'unread' | 'read')} value={readFilter}>
                <option value="all">All states</option>
                <option value="unread">Unread</option>
                <option value="read">Read</option>
              </Select>
            </div>
          </div>

          {notice && <p className="form-success">{notice}</p>}
          {error && <p className="form-error">{error}</p>}

          {loading ? (
            <p className="muted">Loading admin notifications...</p>
          ) : visibleNotifications.length === 0 ? (
            <p className="muted">No notifications matched the current filter.</p>
          ) : (
            <div className="admin-notifications-list">
              {visibleNotifications.map((notification) => (
                <article
                  className={
                    selectedNotification?.id === notification.id
                      ? 'admin-notification-row is-selected'
                      : 'admin-notification-row'
                  }
                  key={notification.id}
                >
                  <button
                    className="admin-notification-row-main"
                    onClick={() => setSelectedNotificationId(notification.id)}
                    type="button"
                  >
                    <div className="admin-notification-row-top">
                      <div>
                        <strong>{notification.title}</strong>
                        <small>{notification.userId}</small>
                      </div>
                      <span
                        className={
                          notification.readAt
                            ? 'admin-notification-read-pill is-read'
                            : 'admin-notification-read-pill is-unread'
                        }
                      >
                        {notification.readAt ? 'Read' : 'Unread'}
                      </span>
                    </div>
                    <p>{notification.message}</p>
                    <div className="admin-notification-row-meta">
                      <span className="admin-notification-type-pill">{notification.type}</span>
                      <span>{formatRelativeTime(notification.createdAt)}</span>
                    </div>
                  </button>

                  <div className="admin-notification-row-actions">
                    <Button onClick={() => beginEdit(notification)} type="button" variant="secondary">
                      <Pencil size={14} />
                      Edit
                    </Button>
                    <Button onClick={() => void handleDelete(notification)} type="button" variant="danger">
                      <Trash2 size={14} />
                      Delete
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="notifications-load-row">
            <Button
              disabled={!hasMore}
              onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
              type="button"
              variant="secondary"
            >
              Load more
            </Button>
          </div>
        </Card>

        <Card as="section" className="admin-notifications-editor-card">
          <div className="admin-notifications-editor-head">
            <div>
              <h3>{mode === 'create' ? 'Create Notification' : 'Edit Notification'}</h3>
              <p className="muted">
                {mode === 'create'
                  ? 'Compose a notification for any target user.'
                  : 'Update the selected notification record.'}
              </p>
            </div>
            {selectedNotification && mode === 'edit' && (
              <button className="admin-notification-inline-link" onClick={beginCreate} type="button">
                Switch to create
              </button>
            )}
          </div>

          {selectedNotification && mode === 'edit' && (
            <div className="admin-notification-selected-summary">
              <div>
                <strong>{selectedNotification.title}</strong>
                <small>{selectedNotification.id}</small>
              </div>
              <div className="admin-notification-selected-meta">
                <span>{formatAbsoluteTime(selectedNotification.createdAt)}</span>
                <span>{selectedNotification.readAt ? 'Currently read' : 'Currently unread'}</span>
              </div>
            </div>
          )}

          <div className="admin-notifications-form-grid">
            <label className="admin-notification-field">
              <span>User ID</span>
              <input
                className="text-input"
                onChange={(event) => handleDraftChange('userId', event.target.value)}
                placeholder="UUID of the target user"
                value={draft.userId}
              />
            </label>

            <label className="admin-notification-field">
              <span>Type</span>
              <Select onChange={(event) => handleDraftChange('type', event.target.value)} value={draft.type}>
                {notificationTypeOptions.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <label className="admin-notification-field">
            <span>Title</span>
            <input
              className="text-input"
              onChange={(event) => handleDraftChange('title', event.target.value)}
              placeholder="Short notification title"
              value={draft.title}
            />
          </label>

          <label className="admin-notification-field">
            <span>Message</span>
            <textarea
              className="text-input admin-notification-textarea"
              onChange={(event) => handleDraftChange('message', event.target.value)}
              placeholder="What should the user see?"
              rows={5}
              value={draft.message}
            />
          </label>

          <label className="admin-notification-field">
            <span>Data JSON</span>
            <textarea
              className="text-input admin-notification-textarea admin-notification-json"
              onChange={(event) => handleDraftChange('dataText', event.target.value)}
              placeholder='{"source":"admin-panel"}'
              rows={8}
              value={draft.dataText}
            />
          </label>

          <label className="admin-notification-checkbox">
            <input
              checked={draft.markRead}
              onChange={(event) => handleDraftChange('markRead', event.target.checked)}
              type="checkbox"
            />
            <span>Mark as read immediately</span>
          </label>

          <div className="admin-notifications-form-actions">
            <Button disabled={busy} onClick={() => void handleSubmit()} type="button">
              {busy ? 'Saving...' : mode === 'create' ? 'Create Notification' : 'Save Changes'}
            </Button>
            <Button disabled={busy} onClick={beginCreate} type="button" variant="secondary">
              Reset Form
            </Button>
          </div>

          <div className="admin-notification-guide">
            <span className="admin-notification-guide-icon">
              <Shield size={14} />
            </span>
            <p>
              This page uses the admin-only CRUD endpoints. Changes here update the same notification records shown in
              volunteer and organizer notification UIs.
            </p>
          </div>
        </Card>
      </div>
    </section>
  );
}
