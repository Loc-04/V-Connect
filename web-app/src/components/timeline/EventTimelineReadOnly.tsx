import { Clock3 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Badge, Card } from '../ui';
import type { TimelineMilestone } from '../../types/timeline';
import { normalizeTimelineItem, safeText } from '../../lib/timelineNormalization';
import { resolveTimelineMilestoneStatus } from '../../lib/timelineStatus';
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
  emptyDescription = 'No timeline milestones available yet.',
  compact = false,
}: EventTimelineReadOnlyProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const ordered = useMemo(
    () => sortTimelineByTime(milestones.map((item, index) => normalizeTimelineItem(item, item.activityId, index))),
    [milestones]
  );
  const displayedMilestones = useMemo(
    () =>
      ordered.map((item) => ({
        ...item,
        status: resolveTimelineMilestoneStatus(item, nowMs),
      })),
    [nowMs, ordered]
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

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

  if (displayedMilestones.length === 0) {
    return (
      <div className="timeline-empty-state">
        <p>{emptyTitle}</p>
        <small>{emptyDescription}</small>
      </div>
    );
  }

  return (
    <div className={compact ? 'timeline-readonly-list is-compact' : 'timeline-readonly-list'}>
      {displayedMilestones.map((milestone, index) => (
        <Card
          as="article"
          className={`timeline-readonly-item ${getHighlightClass(displayedMilestones, index)}`.trim()}
          key={milestone.id}
        >
          <div className="timeline-item-head">
            <div>
              <p className="timeline-item-title">{safeText(milestone.title, 'Untitled milestone')}</p>
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

          {safeText(milestone.description) ? (
            <p className="timeline-item-description">{safeText(milestone.description)}</p>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
