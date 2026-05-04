import { Badge } from '../ui';
import './FeedbackShared.css';

export type ReviewStatus = 'Spam' | 'Positive' | 'Neutral' | 'Negative' | 'Incident' | 'Pos' | 'Neu' | 'Neg' | string;

interface ReviewStatusTagProps {
  status: ReviewStatus;
  className?: string;
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function toCanonicalStatus(status: ReviewStatus): 'Spam' | 'Positive' | 'Neutral' | 'Negative' | 'Incident' {
  const normalized = normalizeText(String(status ?? ''));

  if (
    normalized === 'spam' ||
    normalized.includes('spam') ||
    normalized.includes('abusive') ||
    normalized.includes('irrelevant') ||
    normalized.includes('duplicate') ||
    normalized.includes('meaningless') ||
    normalized.includes('toxic')
  ) {
    return 'Spam';
  }

  if (normalized === 'pos' || normalized === 'positive' || normalized.includes('compliment') || normalized.includes('satisfied')) {
    return 'Positive';
  }

  if (
    normalized === 'neg' ||
    normalized === 'nega' ||
    normalized === 'negative' ||
    normalized.includes('complaint') ||
    normalized.includes('issue') ||
    normalized.includes('dissatisfied') ||
    normalized.includes('problem')
  ) {
    return 'Negative';
  }

  if (normalized === 'incident' || normalized.includes('safety') || normalized.includes('unsafe')) {
    return 'Incident';
  }

  return 'Neutral';
}

function toTone(status: 'Spam' | 'Positive' | 'Neutral' | 'Negative' | 'Incident') {
  if (status === 'Positive') {
    return 'success' as const;
  }
  if (status === 'Negative' || status === 'Incident' || status === 'Spam') {
    return 'danger' as const;
  }
  return 'neutral' as const;
}

function toClassName(status: 'Spam' | 'Positive' | 'Neutral' | 'Negative' | 'Incident') {
  if (status === 'Positive') {
    return 'is-pos';
  }
  if (status === 'Negative' || status === 'Incident') {
    return 'is-neg';
  }
  if (status === 'Spam') {
    return 'is-spam';
  }
  return 'is-neu';
}

export function ReviewStatusTag({ status, className = '' }: ReviewStatusTagProps) {
  const canonical = toCanonicalStatus(status);
  const classes = `feedback-shared-status ${toClassName(canonical)} ${className}`.trim();

  return (
    <Badge className={classes} tone={toTone(canonical)}>
      {canonical}
    </Badge>
  );
}
