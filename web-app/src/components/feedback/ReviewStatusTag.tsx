import { Badge } from '../ui';
import './FeedbackShared.css';

export type ReviewStatus = 'Spam' | 'Pos' | 'Neu' | 'Neg' | string;

interface ReviewStatusTagProps {
  status: ReviewStatus;
  className?: string;
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function toCanonicalStatus(status: ReviewStatus): 'Spam' | 'Pos' | 'Neu' | 'Neg' {
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
    return 'Pos';
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
    return 'Neg';
  }

  return 'Neu';
}

function toTone(status: 'Spam' | 'Pos' | 'Neu' | 'Neg') {
  if (status === 'Pos') {
    return 'success' as const;
  }
  if (status === 'Neg' || status === 'Spam') {
    return 'danger' as const;
  }
  return 'neutral' as const;
}

function toClassName(status: 'Spam' | 'Pos' | 'Neu' | 'Neg') {
  if (status === 'Pos') {
    return 'is-pos';
  }
  if (status === 'Neg') {
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
