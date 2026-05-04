import type { TimelineMilestoneStatus } from '../types/timeline';

interface TimelineStatusInput {
  startTime?: string | null;
  endTime?: string | null;
  status?: TimelineMilestoneStatus | string | null;
}

function parseDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export function isTimelineCancelledStatus(value: unknown): boolean {
  return String(value ?? '').trim().toLowerCase() === 'cancelled';
}

export function computeAutoTimelineStatus(
  startTime?: string | null,
  endTime?: string | null,
  nowMs: number = Date.now()
): TimelineMilestoneStatus {
  const start = parseDate(startTime);
  const end = parseDate(endTime);
  if (!start || !end) {
    return 'upcoming';
  }

  const startMs = start.getTime();
  const endMs = end.getTime();
  if (startMs > endMs) {
    return 'upcoming';
  }

  if (nowMs < startMs) {
    return 'upcoming';
  }

  if (nowMs <= endMs) {
    return 'in_progress';
  }

  return 'completed';
}

export function resolveTimelineMilestoneStatus(
  input: TimelineStatusInput,
  nowMs: number = Date.now()
): TimelineMilestoneStatus {
  if (isTimelineCancelledStatus(input.status)) {
    return 'cancelled';
  }

  return computeAutoTimelineStatus(input.startTime, input.endTime, nowMs);
}

