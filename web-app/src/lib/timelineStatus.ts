import type { TimelineMilestoneStatus } from '../types/timeline';

const timelineStatusTransitions: Record<TimelineMilestoneStatus, TimelineMilestoneStatus[]> = {
  upcoming: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'delayed', 'cancelled'],
  delayed: ['in_progress', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function getAllowedTimelineStatusTransitions(status: TimelineMilestoneStatus): TimelineMilestoneStatus[] {
  return [...timelineStatusTransitions[status]];
}

export function getSelectableTimelineStatuses(status: TimelineMilestoneStatus): TimelineMilestoneStatus[] {
  return [status, ...timelineStatusTransitions[status]];
}

export function canTransitionTimelineStatus(from: TimelineMilestoneStatus, to: TimelineMilestoneStatus): boolean {
  if (from === to) {
    return true;
  }
  return timelineStatusTransitions[from].includes(to);
}

export function isTimelineStatusLocked(status: TimelineMilestoneStatus): boolean {
  return timelineStatusTransitions[status].length === 0;
}
