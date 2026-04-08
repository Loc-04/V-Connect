import type { LucideIcon } from 'lucide-react';
import {
  Award,
  BriefcaseBusiness,
  CheckCheck,
  CheckCircle2,
  Mail,
  MessageSquare,
  Shield,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '../../auth/useAuth';
import { Button, Card } from '../../components/ui';
import { OrganizerShell } from '../../layouts/OrganizerShell';
import { VolunteerShell } from '../../layouts/VolunteerShell';
import {
  clearNotifications,
  getNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  type NotificationEntry,
  type NotificationType,
} from '../../lib/notifications';
import '../../pages/NotificationsPage.css';

type NotificationFilter = 'all' | 'unread';
type NotificationWorkspace = 'volunteer' | 'organizer';

const PAGE_SIZE = 6;

const iconByType: Record<NotificationType, LucideIcon> = {
  opportunity: BriefcaseBusiness,
  feedback: MessageSquare,
  approval: CheckCircle2,
  certificate: Award,
  security: Shield,
  message: Mail,
};

function formatTimeAgo(value: string): string {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return '--';
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

function NotificationsCardBody({
  busy,
  error,
  filter,
  hasMore,
  loading,
  notifications,
  unreadCount,
  visibleCount,
  onClearAll,
  onFilterChange,
  onLoadMore,
  onMarkAllAsRead,
  onNotificationClick,
}: {
  busy: boolean;
  error: string | null;
  filter: NotificationFilter;
  hasMore: boolean;
  loading: boolean;
  notifications: NotificationEntry[];
  unreadCount: number;
  visibleCount: number;
  onClearAll: () => Promise<void>;
  onFilterChange: (nextFilter: NotificationFilter) => void;
  onLoadMore: () => void;
  onMarkAllAsRead: () => Promise<void>;
  onNotificationClick: (notification: NotificationEntry) => Promise<void>;
}) {
  const filteredNotifications = useMemo(
    () => (filter === 'unread' ? notifications.filter((notification) => !notification.read) : notifications),
    [filter, notifications]
  );
  const visibleNotifications = filteredNotifications.slice(0, visibleCount);

  return (
    <>
      <div className="notifications-head-actions">
        <Button
          className="notifications-action-btn"
          disabled={busy || unreadCount === 0}
          onClick={() => void onMarkAllAsRead()}
          type="button"
          variant="secondary"
        >
          <CheckCheck className="notifications-action-icon" />
          Mark all as read
        </Button>
        <Button
          className="notifications-action-btn danger"
          disabled={busy || notifications.length === 0}
          onClick={() => void onClearAll()}
          type="button"
          variant="secondary"
        >
          <Trash2 className="notifications-action-icon" />
          Clear all
        </Button>
      </div>

      <Card as="section" className="notifications-page-card">
        <div className="notifications-filter-tabs" role="tablist" aria-label="Notification filters">
          <button
            className={filter === 'all' ? 'notifications-tab is-active' : 'notifications-tab'}
            onClick={() => onFilterChange('all')}
            type="button"
          >
            All Notifications
          </button>
          <button
            className={filter === 'unread' ? 'notifications-tab is-active' : 'notifications-tab'}
            onClick={() => onFilterChange('unread')}
            type="button"
          >
            Unread
            <span className="notifications-unread-badge">{unreadCount}</span>
          </button>
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="notifications-list" aria-live="polite">
          {loading && <p className="muted">Loading notifications...</p>}

          {!loading && visibleNotifications.length === 0 && (
            <p className="muted">No notifications found for this filter.</p>
          )}

          {!loading &&
            visibleNotifications.map((notification) => {
              const Icon = iconByType[notification.type];
              return (
                <button
                  className={notification.read ? 'notification-card' : 'notification-card is-unread'}
                  key={notification.id}
                  onClick={() => void onNotificationClick(notification)}
                  type="button"
                >
                  <span className={`notification-icon-wrap notification-icon-${notification.type}`} aria-hidden="true">
                    <Icon className="notification-icon" />
                  </span>

                  <span className="notification-content">
                    <span className="notification-head-row">
                      <strong>{notification.title}</strong>
                    </span>
                    <span>{notification.description}</span>
                  </span>

                  <span className="notification-meta">
                    <time dateTime={notification.timestamp}>{formatTimeAgo(notification.timestamp)}</time>
                    {!notification.read && <span className="notification-unread-dot" aria-hidden="true" />}
                  </span>
                </button>
              );
            })}
        </div>

        <div className="notifications-load-row">
          <Button
            aria-label="Load previous notifications"
            className="notifications-load-btn"
            disabled={!hasMore}
            onClick={onLoadMore}
            type="button"
            variant="secondary"
          >
            Load previous notifications
          </Button>
        </div>
      </Card>
    </>
  );
}

export function NotificationsWorkspacePage({ workspace }: { workspace: NotificationWorkspace }) {
  const { profile, session } = useAuth();
  const userId = profile?.id ?? null;
  const accessToken = session?.access_token ?? null;

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);

  useEffect(() => {
    if (!userId || !accessToken) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const nextNotifications = await getNotifications(accessToken);
        if (!cancelled) {
          setNotifications(nextNotifications);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load notifications.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, userId]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filter]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications]
  );

  const filteredNotifications = useMemo(
    () => (filter === 'unread' ? notifications.filter((notification) => !notification.read) : notifications),
    [filter, notifications]
  );
  const hasMore = filteredNotifications.length > visibleCount;

  const handleMarkAllAsRead = async () => {
    if (!accessToken || unreadCount === 0) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await markAllNotificationsAsRead(accessToken);
      setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Failed to mark notifications as read.');
    } finally {
      setBusy(false);
    }
  };

  const handleClearAll = async () => {
    if (!accessToken || notifications.length === 0) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await clearNotifications(accessToken);
      setNotifications([]);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Failed to clear notifications.');
    } finally {
      setBusy(false);
    }
  };

  const handleNotificationClick = async (notification: NotificationEntry) => {
    if (!accessToken || notification.read) {
      return;
    }

    try {
      const updatedNotification = await markNotificationAsRead(accessToken, notification.id);
      setNotifications((current) =>
        current.map((item) => (item.id === updatedNotification.id ? updatedNotification : item))
      );
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Failed to update notification status.');
    }
  };

  const content = (
    <NotificationsCardBody
      busy={busy}
      error={error}
      filter={filter}
      hasMore={hasMore}
      loading={loading}
      notifications={notifications}
      onClearAll={handleClearAll}
      onFilterChange={setFilter}
      onLoadMore={() => setVisibleCount((current) => current + PAGE_SIZE)}
      onMarkAllAsRead={handleMarkAllAsRead}
      onNotificationClick={handleNotificationClick}
      unreadCount={unreadCount}
      visibleCount={visibleCount}
    />
  );

  if (workspace === 'organizer') {
    return (
      <OrganizerShell
        activeNav="notifications"
        pageSubtitle="Track organizer-side updates such as registrations, approvals, and system alerts."
        pageTitle="Notifications"
      >
        {content}
      </OrganizerShell>
    );
  }

  return (
    <VolunteerShell
      activeNav="notifications"
      pageSubtitle="Stay updated with your latest volunteer activities and system alerts."
      pageTitle="Notifications"
    >
      {content}
    </VolunteerShell>
  );
}
