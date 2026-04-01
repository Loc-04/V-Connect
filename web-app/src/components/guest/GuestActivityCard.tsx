import { CalendarDays, MapPin } from 'lucide-react';

import { Badge, Button, Card } from '../ui';
import type { GuestProtectedAction } from '../../lib/guestAuth';
import { getGuestAvailabilityMeta, type GuestActivityRecord } from '../../lib/guestActivities';
import './GuestShared.css';

interface GuestActivityCardProps {
  activity: GuestActivityRecord;
  variant?: 'browse' | 'featured';
  onViewDetails: (activityId: string) => void;
  onProtectedAction?: (action: GuestProtectedAction, activity: GuestActivityRecord) => void;
}

function formatDateLabel(startTime: string) {
  const date = new Date(startTime);
  if (Number.isNaN(date.getTime())) {
    return 'Date TBD';
  }

  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getLocationLabel(activity: GuestActivityRecord) {
  const parts = [activity.location.address, activity.location.city].filter(Boolean);
  return parts.join(', ') || 'Location TBD';
}

export function GuestActivityCard({
  activity,
  variant = 'browse',
  onViewDetails,
  onProtectedAction,
}: GuestActivityCardProps) {
  const availability = getGuestAvailabilityMeta(activity);
  const isFeatured = variant === 'featured';

  return (
    <Card as="article" className={isFeatured ? 'guest-opportunity-card is-featured' : 'guest-opportunity-card'}>
      <div className="guest-opportunity-media">
        <img alt={activity.title} className="guest-opportunity-image" src={activity.imageUrl} />
        <div className="guest-opportunity-badges">
          <Badge className="guest-opportunity-badge" tone="neutral">
            {activity.domain}
          </Badge>
          <Badge className={`guest-opportunity-badge is-${availability.tone}`} tone={availability.badgeTone}>
            {availability.label}
          </Badge>
        </div>
      </div>

      <div className="guest-opportunity-body">
        <div className="guest-opportunity-topline">
          <span>
            <CalendarDays size={14} />
            {formatDateLabel(activity.startTime)}
          </span>
          <span>
            {activity.currentParticipants}/{activity.capacity}
          </span>
        </div>

        <div className="guest-opportunity-copy">
          <div className="guest-opportunity-tags">
            {activity.tags.slice(0, 2).map((tag) => (
              <Badge className="guest-opportunity-tag" key={`${activity.id}-${tag}`} tone="accent">
                {tag}
              </Badge>
            ))}
          </div>
          <h3>{activity.title}</h3>
          <p className="guest-opportunity-summary">{isFeatured ? activity.excerpt : activity.cardSummary}</p>
          <p className="guest-opportunity-org">{activity.organization}</p>
          <p className="guest-opportunity-location">
            <MapPin size={14} />
            {getLocationLabel(activity)}
          </p>
        </div>

        <div className="guest-opportunity-actions">
          <Button onClick={() => onViewDetails(activity.id)} type="button" variant="secondary">
            View Details
          </Button>
          <Button onClick={() => onProtectedAction?.('join', activity)} type="button">
            Join Activity
          </Button>
        </div>
      </div>
    </Card>
  );
}
