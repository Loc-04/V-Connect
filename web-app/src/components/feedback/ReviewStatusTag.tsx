import { Badge } from '../ui';
import './FeedbackShared.css';

export type ReviewStatus = 'positive' | 'neutral' | 'negative' | 'flagged' | 'reviewed' | 'pending' | string;

interface ReviewStatusTagProps {
  status: ReviewStatus;
  label?: string;
  className?: string;
}

function normalizeStatus(status: string) {
  return status.trim().toLowerCase();
}

function getTone(status: string) {
  const normalized = normalizeStatus(status);

  if (normalized === 'positive') {
    return 'success' as const;
  }
  if (normalized === 'negative' || normalized === 'flagged') {
    return 'danger' as const;
  }
  if (normalized === 'reviewed') {
    return 'accent' as const;
  }
  if (normalized === 'pending') {
    return 'info' as const;
  }
  return 'neutral' as const;
}

function getVariantClass(status: string) {
  const normalized = normalizeStatus(status);

  if (
    normalized === 'positive' ||
    normalized === 'neutral' ||
    normalized === 'negative' ||
    normalized === 'flagged' ||
    normalized === 'reviewed' ||
    normalized === 'pending'
  ) {
    return `is-${normalized}`;
  }

  return 'is-unknown';
}

function toDefaultLabel(status: string) {
  const normalized = normalizeStatus(status);
  if (!normalized) {
    return 'Unknown';
  }

  return normalized
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function ReviewStatusTag({ status, label, className = '' }: ReviewStatusTagProps) {
  const classes = `feedback-shared-status ${getVariantClass(status)} ${className}`.trim();

  return (
    <Badge className={classes} tone={getTone(status)}>
      {label ?? toDefaultLabel(status)}
    </Badge>
  );
}
