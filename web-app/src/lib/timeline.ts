import { sortTimelineByTime } from './timelineValidation';
import type {
  TimelineIntegrationMeta,
  TimelineMilestone,
  TimelineMilestoneDraft,
  TimelineMilestoneStatus,
} from '../types/timeline';

const timelineStore = new Map<string, TimelineMilestone[]>();

const integrationMeta: TimelineIntegrationMeta = {
  mode: 'local_only',
  pendingServerIntegration: true,
  message: 'Timeline data is currently stored in frontend session only. Backend integration is pending.',
};

function cloneMilestone(item: TimelineMilestone): TimelineMilestone {
  return { ...item };
}

function createTimelineId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `timeline-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeMilestone(activityId: string, draft: TimelineMilestoneDraft, orderIndex: number): TimelineMilestone {
  const now = new Date().toISOString();
  return {
    id: draft.id ?? createTimelineId(),
    activityId,
    title: draft.title.trim(),
    description: draft.description.trim(),
    startTime: draft.startTime,
    endTime: draft.endTime,
    orderIndex,
    type: draft.type,
    status: draft.status ?? 'upcoming',
    createdAt: now,
    updatedAt: now,
    source: 'local_only',
  };
}

function normalizeTimeline(activityId: string, rows: Array<TimelineMilestone | TimelineMilestoneDraft>) {
  const normalized = rows.map((row, index) => {
    if ('activityId' in row) {
      return {
        ...row,
        activityId,
      };
    }
    return normalizeMilestone(activityId, row, index);
  });

  const sorted = sortTimelineByTime(normalized);
  return sorted.map((item, index) => ({
    ...item,
    orderIndex: index,
  }));
}

function writeTimeline(activityId: string, rows: TimelineMilestone[]) {
  timelineStore.set(activityId, normalizeTimeline(activityId, rows));
}

function readTimeline(activityId: string): TimelineMilestone[] {
  const rows = timelineStore.get(activityId) ?? [];
  return normalizeTimeline(activityId, rows).map(cloneMilestone);
}

export function supportsTimelineServerIntegration() {
  return integrationMeta.mode === 'server';
}

export function getTimelineIntegrationMeta(): TimelineIntegrationMeta {
  return { ...integrationMeta };
}

export async function listActivityTimeline(activityId: string): Promise<{
  milestones: TimelineMilestone[];
  integration: TimelineIntegrationMeta;
}> {
  return {
    milestones: readTimeline(activityId),
    integration: getTimelineIntegrationMeta(),
  };
}

export async function replaceActivityTimeline(
  activityId: string,
  drafts: TimelineMilestoneDraft[]
): Promise<{
  milestones: TimelineMilestone[];
  integration: TimelineIntegrationMeta;
}> {
  const next = normalizeTimeline(activityId, drafts);
  writeTimeline(activityId, next);
  return {
    milestones: readTimeline(activityId),
    integration: getTimelineIntegrationMeta(),
  };
}

export async function appendActivityTimeline(
  activityId: string,
  drafts: TimelineMilestoneDraft[]
): Promise<{
  milestones: TimelineMilestone[];
  integration: TimelineIntegrationMeta;
}> {
  const current = readTimeline(activityId);
  const seeded = drafts.map((draft, index) => normalizeMilestone(activityId, draft, current.length + index));
  const merged = normalizeTimeline(activityId, [...current, ...seeded]);
  writeTimeline(activityId, merged);
  return {
    milestones: readTimeline(activityId),
    integration: getTimelineIntegrationMeta(),
  };
}

export async function createTimelineMilestone(
  activityId: string,
  draft: TimelineMilestoneDraft
): Promise<{
  milestone: TimelineMilestone;
  milestones: TimelineMilestone[];
  integration: TimelineIntegrationMeta;
}> {
  const current = readTimeline(activityId);
  const milestone = normalizeMilestone(activityId, draft, current.length);
  const merged = normalizeTimeline(activityId, [...current, milestone]);
  writeTimeline(activityId, merged);
  return {
    milestone,
    milestones: readTimeline(activityId),
    integration: getTimelineIntegrationMeta(),
  };
}

export async function updateTimelineMilestone(
  activityId: string,
  milestoneId: string,
  draft: TimelineMilestoneDraft
): Promise<{
  milestone: TimelineMilestone | null;
  milestones: TimelineMilestone[];
  integration: TimelineIntegrationMeta;
}> {
  const current = readTimeline(activityId);
  const now = new Date().toISOString();
  let updatedMilestone: TimelineMilestone | null = null;
  const updated = current.map((item) => {
    if (item.id !== milestoneId) {
      return item;
    }

    updatedMilestone = {
      ...item,
      title: draft.title.trim(),
      description: draft.description.trim(),
      startTime: draft.startTime,
      endTime: draft.endTime,
      type: draft.type,
      status: draft.status ?? item.status,
      updatedAt: now,
    };

    return updatedMilestone;
  });

  writeTimeline(activityId, updated);
  return {
    milestone: updatedMilestone,
    milestones: readTimeline(activityId),
    integration: getTimelineIntegrationMeta(),
  };
}

export async function updateTimelineMilestoneStatus(
  activityId: string,
  milestoneId: string,
  status: TimelineMilestoneStatus
): Promise<{
  milestone: TimelineMilestone | null;
  milestones: TimelineMilestone[];
  integration: TimelineIntegrationMeta;
}> {
  const current = readTimeline(activityId);
  const now = new Date().toISOString();
  let updatedMilestone: TimelineMilestone | null = null;
  const updated = current.map((item) => {
    if (item.id !== milestoneId) {
      return item;
    }
    updatedMilestone = {
      ...item,
      status,
      updatedAt: now,
    };
    return updatedMilestone;
  });
  writeTimeline(activityId, updated);
  return {
    milestone: updatedMilestone,
    milestones: readTimeline(activityId),
    integration: getTimelineIntegrationMeta(),
  };
}

export async function deleteTimelineMilestone(
  activityId: string,
  milestoneId: string
): Promise<{
  milestones: TimelineMilestone[];
  integration: TimelineIntegrationMeta;
}> {
  const current = readTimeline(activityId);
  const filtered = current.filter((item) => item.id !== milestoneId);
  writeTimeline(activityId, filtered);
  return {
    milestones: readTimeline(activityId),
    integration: getTimelineIntegrationMeta(),
  };
}

export async function moveTimelineMilestone(
  activityId: string,
  milestoneId: string,
  direction: 'up' | 'down'
): Promise<{
  milestones: TimelineMilestone[];
  integration: TimelineIntegrationMeta;
}> {
  const current = readTimeline(activityId);
  const currentIndex = current.findIndex((item) => item.id === milestoneId);
  if (currentIndex < 0) {
    return {
      milestones: current,
      integration: getTimelineIntegrationMeta(),
    };
  }

  const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (swapIndex < 0 || swapIndex >= current.length) {
    return {
      milestones: current,
      integration: getTimelineIntegrationMeta(),
    };
  }

  const next = [...current];
  const temp = next[currentIndex];
  next[currentIndex] = next[swapIndex];
  next[swapIndex] = temp;

  writeTimeline(activityId, next);
  return {
    milestones: readTimeline(activityId),
    integration: getTimelineIntegrationMeta(),
  };
}
