import { Badge } from '../ui';
import './FeedbackShared.css';

type IssuePriority = 'high' | 'medium' | 'low';
type IssueState = 'active' | 'warning';

interface IssueBadgeProps {
  priority?: IssuePriority;
  state?: IssueState;
  label?: string;
  className?: string;
}

function getPriorityLabel(priority: IssuePriority) {
  if (priority === 'high') {
    return 'High';
  }
  if (priority === 'medium') {
    return 'Medium';
  }
  return 'Low';
}

export function IssueBadge({ priority, state, label, className = '' }: IssueBadgeProps) {
  const variantClass = priority ? `is-priority-${priority}` : state ? `is-state-${state}` : 'is-default';
  const classes = `feedback-shared-issue-badge ${variantClass} ${className}`.trim();
  const resolvedLabel = label ?? (priority ? getPriorityLabel(priority) : state === 'warning' ? 'Warning' : 'Active');

  return (
    <Badge className={classes} tone="neutral">
      {resolvedLabel}
    </Badge>
  );
}
