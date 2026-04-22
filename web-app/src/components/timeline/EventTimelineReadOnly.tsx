import { Clock3 } from 'lucide-react';

import { Badge, Card } from '../ui';
import type { TimelineMilestone } from '../../types/timeline';
import { sortTimelineByTime } from '../../lib/timelineValidation';
import { TimelineStatusBadge } from './TimelineStatusBadge';

function formatRange(startTime: string, endTime: string) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'Time TBD';
  }

  return `${start.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })} - ${end.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function getTypeLabel(type: string) {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getHighlightClass(items: TimelineMilestone[], index: number) {
  const item = items[index];
  if (!item) {
    return '';
  }

  if (item.status === 'in_progress') {
    return 'is-current';
  }

  if (item.status === 'upcoming') {
    const hasCurrent = items.some((row) => row.status === 'in_progress');
    if (!hasCurrent && items.slice(0, index).every((row) => row.status !== 'upcoming')) {
      return 'is-next';
    }
  }

  return '';
}

interface EventTimelineReadOnlyProps {
  milestones: TimelineMilestone[];
  loading?: boolean;
  error?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
  compact?: boolean;
}

export function EventTimelineReadOnly({
  milestones,
  loading = false,
  error = null,
  emptyTitle = 'Timeline is not available',
  emptyDescription = 'Organizer milestones will appear here once timeline data is provided.',
  compact = false,
}: EventTimelineReadOnlyProps) {
  const ordered = sortTimelineByTime(milestones);

  if (loading) {
    return (
      <div className="timeline-empty-state">
        <p className="muted">Loading timeline...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="timeline-empty-state">
        <p className="form-error">{error}</p>
      </div>
    );
  }

  if (ordered.length === 0) {
    return (
      <div className="timeline-empty-state">
        <p>{emptyTitle}</p>
        <small>{emptyDescription}</small>
      </div>
    );
  }

  return (
    <div className={compact ? 'timeline-readonly-list is-compact' : 'timeline-readonly-list'}>
      {ordered.map((milestone, index) => (
        <Card
          as="article"
          className={`timeline-readonly-item ${getHighlightClass(ordered, index)}`.trim()}
          key={milestone.id}
        >
          <div className="timeline-item-head">
            <div>
              <p className="timeline-item-title">{milestone.title}</p>
              <small className="timeline-item-time">
                <Clock3 size={13} />
                <span>{formatRange(milestone.startTime, milestone.endTime)}</span>
              </small>
            </div>
            <TimelineStatusBadge status={milestone.status} />
          </div>

          <div className="timeline-item-tags">
            <Badge tone="neutral">{getTypeLabel(milestone.type)}</Badge>
          </div>

          {milestone.description ? <p className="timeline-item-description">{milestone.description}</p> : null}
        </Card>
      ))}
    </div>
  );
}
