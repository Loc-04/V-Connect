import type { HTMLAttributes } from 'react';

import { Badge } from '../ui';
import './AttendanceShared.css';

export type AttendanceDisplayStatus =
  | 'checked_in'
  | 'not_checked_in'
  | 'assigned'
  | 'pending'
  | 'absent'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'unknown';

interface AttendanceStatusBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  status?: string | null;
  label?: string;
}

function toTitleCase(value: string) {
  return value
    .split('_')
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function normalizeAttendanceStatus(status?: string | null): AttendanceDisplayStatus {
  const normalized = String(status ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');

  if (
    normalized === 'checked_in' ||
    normalized === 'not_checked_in' ||
    normalized === 'assigned' ||
    normalized === 'pending' ||
    normalized === 'absent' ||
    normalized === 'approved' ||
    normalized === 'rejected' ||
    normalized === 'cancelled'
  ) {
    return normalized;
  }

  return 'unknown';
}

function getTone(status: AttendanceDisplayStatus) {
  if (status === 'checked_in') {
    return 'success' as const;
  }
  if (status === 'approved') {
    return 'accent' as const;
  }
  if (status === 'pending' || status === 'assigned') {
    return 'info' as const;
  }
  if (status === 'absent' || status === 'rejected' || status === 'cancelled') {
    return 'danger' as const;
  }
  return 'neutral' as const;
}

function getLabel(status: AttendanceDisplayStatus) {
  if (status === 'unknown') {
    return 'Unknown';
  }
  return toTitleCase(status);
}

export function AttendanceStatusBadge({ status, label, className = '', ...props }: AttendanceStatusBadgeProps) {
  const normalized = normalizeAttendanceStatus(status);
  const classes = `attendance-status-badge is-${normalized} ${className}`.trim();

  return (
    <Badge className={classes} tone={getTone(normalized)} {...props}>
      {label ?? getLabel(normalized)}
    </Badge>
  );
}
