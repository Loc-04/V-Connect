import { apiRequest } from './api';
import { supabase } from './supabase';
import { sortTimelineByTime } from './timelineValidation';
import type {
  TimelineIntegrationMeta,
  TimelineMilestone,
  TimelineMilestoneDraft,
  TimelineMilestoneStatus,
  TimelineMilestoneType,
} from '../types/timeline';

interface TimelineApiRow {
  id: string;
  activity_id: string;
  title: string;
  description: string | null;
  timeline_choice: string;
  created_at: string | null;
}

interface TimelineListResponse {
  timeline?: TimelineApiRow[];
}

interface TimelineMilestoneResponse {
  milestone?: TimelineApiRow | null;
}

const metaPrefix = '[[VC_TIMELINE_META:';
const metaSuffix = ']]';
const minuteMs = 60_000;
const validTimelineTypes: TimelineMilestoneType[] = ['check_in', 'opening', 'session', 'break', 'closing', 'wrap_up', 'custom'];
const validTimelineStatuses: TimelineMilestoneStatus[] = ['upcoming', 'in_progress', 'completed', 'delayed', 'cancelled'];

const integrationMeta: TimelineIntegrationMeta = {
  mode: 'server',
  pendingServerIntegration: false,
  message: 'Timeline changes are saved to the server.',
};

interface TimelineMetaPayload {
  endTime?: string;
  type?: TimelineMilestoneType;
  status?: TimelineMilestoneStatus;
}

function isValidTimelineType(value: unknown): value is TimelineMilestoneType {
  return typeof value === 'string' && validTimelineTypes.includes(value as TimelineMilestoneType);
}

function isValidTimelineStatus(value: unknown): value is TimelineMilestoneStatus {
  return typeof value === 'string' && validTimelineStatuses.includes(value as TimelineMilestoneStatus);
}

function parseTimelineMeta(descriptionValue: string | null | undefined): { description: string; meta: TimelineMetaPayload } {
  const raw = typeof descriptionValue === 'string' ? descriptionValue : '';
  const trimmed = raw.trimEnd();
  const suffixIndex = trimmed.lastIndexOf(metaSuffix);
  const prefixIndex = trimmed.lastIndexOf(metaPrefix);

  if (prefixIndex < 0 || suffixIndex !== trimmed.length - metaSuffix.length || prefixIndex >= suffixIndex) {
    return { description: trimmed, meta: {} };
  }

  const jsonText = trimmed.slice(prefixIndex + metaPrefix.length, suffixIndex).trim();
  const visibleDescription = trimmed.slice(0, prefixIndex).trimEnd();

  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const meta: TimelineMetaPayload = {};
    if (typeof parsed.endTime === 'string' && parsed.endTime.trim().length > 0) {
      meta.endTime = parsed.endTime;
    }
    if (isValidTimelineType(parsed.type)) {
      meta.type = parsed.type;
    }
    if (isValidTimelineStatus(parsed.status)) {
      meta.status = parsed.status;
    }
    return { description: visibleDescription, meta };
  } catch {
    return { description: trimmed, meta: {} };
  }
}

function encodeTimelineDescription(description: string, draft: TimelineMilestoneDraft): string {
  const meta: TimelineMetaPayload = {
    endTime: draft.endTime || draft.startTime,
    type: draft.type,
    status: draft.status ?? 'upcoming',
  };
  const encodedMeta = `${metaPrefix}${JSON.stringify(meta)}${metaSuffix}`;
  const visible = description.trim();
  return visible ? `${visible}\n${encodedMeta}` : encodedMeta;
}

function mapApiRowToMilestone(row: TimelineApiRow, index: number): TimelineMilestone {
  const parsed = parseTimelineMeta(row.description);
  const startTime = row.timeline_choice;
  const endTime = parsed.meta.endTime && !Number.isNaN(new Date(parsed.meta.endTime).getTime()) ? parsed.meta.endTime : startTime;
  const createdAt = row.created_at ?? startTime;

  return {
    id: row.id,
    activityId: row.activity_id,
    title: String(row.title ?? '').trim(),
    description: parsed.description,
    startTime,
    endTime,
    orderIndex: index,
    type: parsed.meta.type ?? 'session',
    status: parsed.meta.status ?? 'upcoming',
    createdAt,
    updatedAt: createdAt,
    source: 'server',
  };
}

function mapRowsToMilestones(rows: TimelineApiRow[]): TimelineMilestone[] {
  return rows.map((row, index) => mapApiRowToMilestone(row, index));
}

function milestoneToDraft(milestone: TimelineMilestone): TimelineMilestoneDraft {
  return {
    id: milestone.id,
    title: milestone.title,
    description: milestone.description,
    startTime: milestone.startTime,
    endTime: milestone.endTime,
    type: milestone.type,
    status: milestone.status,
    orderIndex: milestone.orderIndex,
  };
}

function midpointIso(leftIso: string, rightIso: string): string | null {
  const left = new Date(leftIso).getTime();
  const right = new Date(rightIso).getTime();
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return null;
  }
  const middle = Math.floor((left + right) / 2);
  if (!Number.isFinite(middle)) {
    return null;
  }
  return new Date(middle).toISOString();
}

function shiftIso(baseIso: string, deltaMs: number): string | null {
  const base = new Date(baseIso).getTime();
  if (!Number.isFinite(base)) {
    return null;
  }
  return new Date(base + deltaMs).toISOString();
}

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(error.message);
  }

  const token = data.session?.access_token;
  if (!token) {
    throw new Error('Please sign in to access timeline data.');
  }
  return token;
}

async function listTimelineRows(activityId: string, accessToken: string): Promise<TimelineApiRow[]> {
  const response = await apiRequest<TimelineListResponse>(`/activities/${activityId}/timeline`, {
    accessToken,
  });

  return Array.isArray(response.timeline) ? response.timeline : [];
}

function buildTimelinePayloadFromDraft(draft: TimelineMilestoneDraft) {
  return {
    title: draft.title.trim(),
    description: encodeTimelineDescription(draft.description ?? '', draft),
    timelineChoice: draft.startTime,
  };
}

async function createTimelineEntry(activityId: string, draft: TimelineMilestoneDraft, accessToken: string) {
  await apiRequest<TimelineMilestoneResponse>(`/activities/${activityId}/timeline`, {
    method: 'POST',
    accessToken,
    body: buildTimelinePayloadFromDraft(draft),
  });
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
  const accessToken = await getAccessToken();
  const rows = await listTimelineRows(activityId, accessToken);
  return {
    milestones: mapRowsToMilestones(rows),
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
  const accessToken = await getAccessToken();
  const existing = await listTimelineRows(activityId, accessToken);

  for (const row of existing) {
    await apiRequest<{ success: boolean }>(`/activities/${activityId}/timeline/${row.id}`, {
      method: 'DELETE',
      accessToken,
    });
  }

  const sortedDrafts = sortTimelineByTime(drafts).map((draft) => ({
    ...draft,
    title: draft.title.trim(),
    description: draft.description.trim(),
    status: draft.status ?? 'upcoming',
  }));

  for (const draft of sortedDrafts) {
    await createTimelineEntry(activityId, draft, accessToken);
  }

  const rows = await listTimelineRows(activityId, accessToken);
  return {
    milestones: mapRowsToMilestones(rows),
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
  const accessToken = await getAccessToken();
  const sortedDrafts = sortTimelineByTime(drafts);
  for (const draft of sortedDrafts) {
    await createTimelineEntry(activityId, draft, accessToken);
  }
  const rows = await listTimelineRows(activityId, accessToken);
  return {
    milestones: mapRowsToMilestones(rows),
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
  const accessToken = await getAccessToken();
  const createResult = await apiRequest<TimelineMilestoneResponse>(`/activities/${activityId}/timeline`, {
    method: 'POST',
    accessToken,
    body: buildTimelinePayloadFromDraft(draft),
  });

  const rows = await listTimelineRows(activityId, accessToken);
  const milestones = mapRowsToMilestones(rows);
  const createdIndex = milestones.findIndex((item) => item.id === createResult.milestone?.id);
  const milestone = createdIndex >= 0 ? milestones[createdIndex] : milestones[milestones.length - 1];

  return {
    milestone,
    milestones,
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
  const accessToken = await getAccessToken();
  await apiRequest<TimelineMilestoneResponse>(`/activities/${activityId}/timeline/${milestoneId}`, {
    method: 'PATCH',
    accessToken,
    body: buildTimelinePayloadFromDraft(draft),
  });

  const rows = await listTimelineRows(activityId, accessToken);
  const milestones = mapRowsToMilestones(rows);
  const milestone = milestones.find((item) => item.id === milestoneId) ?? null;
  return {
    milestone,
    milestones,
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
  const current = await listActivityTimeline(activityId);
  const target = current.milestones.find((item) => item.id === milestoneId);
  if (!target) {
    return {
      milestone: null,
      milestones: current.milestones,
      integration: current.integration,
    };
  }

  const updated = await updateTimelineMilestone(activityId, milestoneId, {
    ...milestoneToDraft(target),
    status,
  });

  return updated;
}

export async function deleteTimelineMilestone(
  activityId: string,
  milestoneId: string
): Promise<{
  milestones: TimelineMilestone[];
  integration: TimelineIntegrationMeta;
}> {
  const accessToken = await getAccessToken();
  await apiRequest<{ success: boolean }>(`/activities/${activityId}/timeline/${milestoneId}`, {
    method: 'DELETE',
    accessToken,
  });
  const rows = await listTimelineRows(activityId, accessToken);
  return {
    milestones: mapRowsToMilestones(rows),
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
  const current = await listActivityTimeline(activityId);
  const ordered = sortTimelineByTime(current.milestones);
  const currentIndex = ordered.findIndex((item) => item.id === milestoneId);
  if (currentIndex < 0) {
    return current;
  }

  const neighborIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (neighborIndex < 0 || neighborIndex >= ordered.length) {
    return current;
  }

  const target = ordered[currentIndex];
  const neighbor = ordered[neighborIndex];
  const outerNeighbor = direction === 'up' ? ordered[currentIndex - 2] : ordered[currentIndex + 2];

  let nextStartTime: string | null;
  if (direction === 'up') {
    nextStartTime = outerNeighbor
      ? midpointIso(outerNeighbor.startTime, neighbor.startTime)
      : shiftIso(neighbor.startTime, -minuteMs);
  } else {
    nextStartTime = outerNeighbor
      ? midpointIso(neighbor.startTime, outerNeighbor.startTime)
      : shiftIso(neighbor.startTime, minuteMs);
  }

  if (!nextStartTime) {
    return current;
  }

  const previousStart = new Date(target.startTime).getTime();
  const previousEnd = new Date(target.endTime).getTime();
  const durationMs = Number.isFinite(previousStart) && Number.isFinite(previousEnd) && previousEnd > previousStart
    ? previousEnd - previousStart
    : 0;
  const nextEndTime = durationMs > 0
    ? new Date(new Date(nextStartTime).getTime() + durationMs).toISOString()
    : nextStartTime;

  const updated = await updateTimelineMilestone(activityId, milestoneId, {
    ...milestoneToDraft(target),
    startTime: nextStartTime,
    endTime: nextEndTime,
  });

  return updated;
}
