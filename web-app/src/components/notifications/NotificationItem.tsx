import type { LucideIcon } from 'lucide-react';
import { Award, BriefcaseBusiness, CheckCircle2, Mail, MessageSquare, Shield } from 'lucide-react';

import type { NotificationEntry, NotificationType } from '../../lib/engagement';

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

interface NotificationItemProps {
  notification: NotificationEntry;
  onSelect: (notification: NotificationEntry) => void;
}

export function NotificationItem({ notification, onSelect }: NotificationItemProps) {
  const Icon = iconByType[notification.type];

  return (
    <button
      className={notification.read ? 'mini-notify-item' : 'mini-notify-item is-unread'}
      onClick={() => onSelect(notification)}
      type="button"
    >
      <span className={`mini-notify-icon mini-notify-icon-${notification.type}`} aria-hidden="true">
        <Icon className="mini-notify-icon-glyph" />
      </span>

      <span className="mini-notify-copy">
        <span className="mini-notify-title">{notification.title}</span>
        <span className="mini-notify-desc">{notification.description}</span>
      </span>

      <span className="mini-notify-meta">
        <span className="mini-notify-time">{formatTimeAgo(notification.timestamp)}</span>
        {!notification.read && <span className="mini-notify-dot" aria-hidden="true" />}
      </span>
    </button>
  );
}
