import { Bell } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../../auth/useAuth';
import {
  getNotificationsForUser,
  markNotificationAsReadForUser,
  type NotificationEntry,
} from '../../lib/engagement';
import { NotificationItem } from './NotificationItem';
import './NotificationDropdown.css';

type NotificationFilter = 'all' | 'unread';

const MAX_VISIBLE_NOTIFICATIONS = 6;

export function NotificationDropdown() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const userId = profile?.id ?? null;

  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!userId) {
      return;
    }

    let cancelled = false;

    const loadNotifications = async () => {
      setLoading(true);
      setError(null);

      try {
        const nextNotifications = await getNotificationsForUser(userId);
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
    };

    void loadNotifications();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (!wrapperRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !userId) {
      return;
    }

    let cancelled = false;

    const refreshNotifications = async () => {
      try {
        const nextNotifications = await getNotificationsForUser(userId);
        if (!cancelled) {
          setNotifications(nextNotifications);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to refresh notifications.');
        }
      }
    };

    void refreshNotifications();

    return () => {
      cancelled = true;
    };
  }, [isOpen, userId]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications]
  );

  const visibleNotifications = useMemo(() => {
    const list =
      filter === 'unread' ? notifications.filter((notification) => !notification.read) : notifications;
    return list.slice(0, MAX_VISIBLE_NOTIFICATIONS);
  }, [filter, notifications]);

  const navigateToNotifications = () => {
    setIsOpen(false);
    navigate('/volunteer/notifications');
  };

  const handleSelectNotification = async (notification: NotificationEntry) => {
    if (!userId) {
      return;
    }

    if (!notification.read) {
      const nextNotifications = await markNotificationAsReadForUser(userId, notification.id);
      setNotifications(nextNotifications);
    }
  };

  return (
    <div className="mini-notify-wrap" ref={wrapperRef}>
      <button
        aria-controls="header-notification-dropdown"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label="Open notifications"
        className="vol-shell-notify-btn mini-notify-trigger"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <Bell className="vol-shell-top-icon" />
        {unreadCount > 0 && <span className="mini-notify-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {isOpen && (
        <section className="mini-notify-dropdown" id="header-notification-dropdown" role="dialog" aria-label="Notifications">
          <div className="mini-notify-head">
            <div className="mini-notify-head-top">
              <h2>Notifications</h2>
              <button className="mini-notify-view-all" onClick={navigateToNotifications} type="button">
                View all
              </button>
            </div>

            <div className="mini-notify-tabs" role="tablist" aria-label="Notification filters">
              <button
                className={filter === 'all' ? 'mini-notify-tab is-active' : 'mini-notify-tab'}
                onClick={() => setFilter('all')}
                type="button"
              >
                All
              </button>
              <button
                className={filter === 'unread' ? 'mini-notify-tab is-active' : 'mini-notify-tab'}
                onClick={() => setFilter('unread')}
                type="button"
              >
                Unread
              </button>
            </div>
          </div>

          <div className="mini-notify-list">
            {loading && <p className="mini-notify-empty">Loading notifications...</p>}
            {!loading && error && <p className="mini-notify-empty">{error}</p>}
            {!loading && !error && visibleNotifications.length === 0 && (
              <p className="mini-notify-empty">No notifications found.</p>
            )}
            {!loading &&
              !error &&
              visibleNotifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onSelect={(item) => {
                    void handleSelectNotification(item);
                  }}
                />
              ))}
          </div>

          <div className="mini-notify-footer">
            <button className="mini-notify-footer-btn" onClick={navigateToNotifications} type="button">
              See previous notifications
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
