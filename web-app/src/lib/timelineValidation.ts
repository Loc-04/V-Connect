import type { TimelineMilestone, TimelineMilestoneDraft, TimelineValidationIssue } from '../types/timeline';

interface TimelineValidationContext {
  activityStartTime?: string | null;
  activityEndTime?: string | null;
  enforceActivityWindow?: boolean;
  disallowPastStart?: boolean;
  now?: string | Date;
}

function asDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function compareByStartTime<T extends TimelineMilestoneDraft | TimelineMilestone>(left: T, right: T) {
  const leftDate = asDate(left.startTime)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const rightDate = asDate(right.startTime)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  if (leftDate !== rightDate) {
    return leftDate - rightDate;
  }

  const leftEnd = asDate(left.endTime)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const rightEnd = asDate(right.endTime)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  if (leftEnd !== rightEnd) {
    return leftEnd - rightEnd;
  }

  return String(left.title ?? '').localeCompare(String(right.title ?? ''));
}

function normalizeOrder<T extends TimelineMilestoneDraft | TimelineMilestone>(items: T[]): T[] {
  const sorted = [...items].sort(compareByStartTime);
  return sorted.map((item, index) => ({
    ...item,
    orderIndex: index,
  }));
}

function hasOverlap(left: TimelineMilestoneDraft | TimelineMilestone, right: TimelineMilestoneDraft | TimelineMilestone) {
  const leftStart = asDate(left.startTime);
  const leftEnd = asDate(left.endTime);
  const rightStart = asDate(right.startTime);
  const rightEnd = asDate(right.endTime);
  if (!leftStart || !leftEnd || !rightStart || !rightEnd) {
    return false;
  }

  return leftStart < rightEnd && rightStart < leftEnd;
}

export function sortTimelineByTime<T extends TimelineMilestoneDraft | TimelineMilestone>(items: T[]): T[] {
  return normalizeOrder(items);
}

export function validateTimelineDrafts(
  drafts: TimelineMilestoneDraft[],
  context: TimelineValidationContext = {}
): TimelineValidationIssue[] {
  const issues: TimelineValidationIssue[] = [];
  const activityStart = asDate(context.activityStartTime ?? null);
  const activityEnd = asDate(context.activityEndTime ?? null);
  const now = context.now instanceof Date ? context.now : asDate(context.now ?? null) ?? new Date();
  const orderedDrafts = normalizeOrder(drafts);

  orderedDrafts.forEach((draft, index) => {
    const draftId = draft.id ?? `draft-${index}`;
    const title = draft.title.trim();
    const start = asDate(draft.startTime);
    const end = asDate(draft.endTime);

    if (!title) {
      issues.push({
        milestoneId: draftId,
        field: 'title',
        level: 'error',
        message: 'Milestone title is required.',
      });
    }

    if (!draft.startTime) {
      issues.push({
        milestoneId: draftId,
        field: 'startTime',
        level: 'error',
        message: 'Start time is required.',
      });
    } else if (!start) {
      issues.push({
        milestoneId: draftId,
        field: 'startTime',
        level: 'error',
        message: 'Start time is invalid.',
      });
    }

    if (!draft.endTime) {
      issues.push({
        milestoneId: draftId,
        field: 'endTime',
        level: 'error',
        message: 'End time is required.',
      });
    } else if (!end) {
      issues.push({
        milestoneId: draftId,
        field: 'endTime',
        level: 'error',
        message: 'End time is invalid.',
      });
    }

    if (start && end && end <= start) {
      issues.push({
        milestoneId: draftId,
        field: 'timeRange',
        level: 'error',
        message: 'End time must be later than start time.',
      });
    }

    if (start && context.disallowPastStart && start < now) {
      issues.push({
        milestoneId: draftId,
        field: 'startTime',
        level: 'error',
        message: 'Start time cannot be in the past.',
      });
    }

    if (start && end && activityStart && activityEnd) {
      const inRange = start >= activityStart && end <= activityEnd;
      if (!inRange) {
        issues.push({
          milestoneId: draftId,
          field: 'activityRange',
          level: context.enforceActivityWindow ? 'error' : 'warning',
          message: 'Milestone should stay within the activity time range.',
        });
      }
    }
  });

  for (let index = 1; index < orderedDrafts.length; index += 1) {
    const previous = orderedDrafts[index - 1];
    const current = orderedDrafts[index];
    if (hasOverlap(previous, current)) {
      issues.push({
        milestoneId: current.id ?? `draft-${index}`,
        field: 'overlap',
        level: 'warning',
        message: 'This milestone overlaps with the previous one.',
      });
    }
  }

  return issues;
}

export function hasTimelineValidationErrors(issues: TimelineValidationIssue[]) {
  return issues.some((issue) => issue.level === 'error');
}
