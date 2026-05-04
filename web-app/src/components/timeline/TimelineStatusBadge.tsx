import { Badge } from '../ui';
import type { TimelineMilestoneStatus } from '../../types/timeline';

function toLabel(status: TimelineMilestoneStatus) {
  switch (status) {
    case 'in_progress':
      return 'In Progress';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    case 'upcoming':
    default:
      return 'Upcoming';
  }
}

function toTone(status: TimelineMilestoneStatus) {
  switch (status) {
    case 'completed':
      return 'success' as const;
    case 'cancelled':
      return 'danger' as const;
    case 'in_progress':
      return 'accent' as const;
    case 'upcoming':
    default:
      return 'info' as const;
  }
}

export function TimelineStatusBadge({
  status,
  className = '',
}: {
  status: TimelineMilestoneStatus;
  className?: string;
}) {
  return (
    <Badge className={`timeline-status-badge ${className}`.trim()} tone={toTone(status)}>
      {toLabel(status)}
    </Badge>
  );
}
