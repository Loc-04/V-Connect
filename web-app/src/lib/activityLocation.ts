import type { ActivityRecord } from '../types/activity';

export function formatActivityLocation(location: ActivityRecord['location']): string {
  if (!location) {
    return 'Location TBD';
  }

  if (typeof location === 'string') {
    return location.trim() || 'Location TBD';
  }

  const parts = [location.address, location.ward, location.province].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );

  return parts.join(', ') || 'Location TBD';
}
