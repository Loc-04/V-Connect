import { apiRequest } from './api';
import { normalizeTimelineItem, normalizeTimelineItems } from './timelineNormalization';
import type {
  TimelineIntegrationMeta,
  TimelineMilestone,
  TimelineMilestoneDraft,
  TimelineMilestoneStatus,
} from '../types/timeline';

const integrationMeta: TimelineIntegrationMeta = {
  mode: 'server',
  pendingServerIntegration: false,
  message: '',
};

interface TimelineListResponse {
  timeline?: unknown;
}

interface TimelineMilestoneResponse {
  milestone?: unknown;
}

function assertAccessToken(accessToken?: string): asserts accessToken is string {
  if (!accessToken) {
    throw new Error('No active session token.');
  }
}

function toTimelinePayload(draft: TimelineMilestoneDraft, orderIndex?: number) {
  return {
    id: draft.id,
    title: draft.title,
    description: draft.description,
    timelineChoice: draft.startTime,
    startTime: draft.startTime,
    endTime: draft.endTime,
    orderIndex,
    type: draft.type,
    status: draft.status ?? 'upcoming',
  };
}

async function fetchTimeline(activityId: string, accessToken: string) {
  const response = await apiRequest<TimelineListResponse>(`/activities/${activityId}/timeline`, {
    accessToken,
  });
  return normalizeTimelineItems(response.timeline ?? [], activityId);
}

export function supportsTimelineServerIntegration() {
  return integrationMeta.mode === 'server';
}

export function getTimelineIntegrationMeta(): TimelineIntegrationMeta {
  return { ...integrationMeta };
}

export async function listActivityTimeline(
  activityId: string,
  accessToken?: string
): Promise<{
  milestones: TimelineMilestone[];
  integration: TimelineIntegrationMeta;
}> {
  assertAccessToken(accessToken);
  return {
    milestones: await fetchTimeline(activityId, accessToken),
    integration: getTimelineIntegrationMeta(),
  };
}

export async function replaceActivityTimeline(
  activityId: string,
  drafts: TimelineMilestoneDraft[],
  accessToken?: string
): Promise<{
  milestones: TimelineMilestone[];
  integration: TimelineIntegrationMeta;
}> {
  assertAccessToken(accessToken);
  const existing = await fetchTimeline(activityId, accessToken);

  await Promise.all(
    existing.map((item) =>
      apiRequest<{ success: boolean }>(`/activities/${activityId}/timeline/${item.id}`, {
        method: 'DELETE',
        accessToken,
      })
    )
  );

  for (let index = 0; index < drafts.length; index += 1) {
    await apiRequest<TimelineMilestoneResponse>(`/activities/${activityId}/timeline`, {
      method: 'POST',
      accessToken,
      body: toTimelinePayload(drafts[index], index),
    });
  }

  return {
    milestones: await fetchTimeline(activityId, accessToken),
    integration: getTimelineIntegrationMeta(),
  };
}

export async function appendActivityTimeline(
  activityId: string,
  drafts: TimelineMilestoneDraft[],
  accessToken?: string
): Promise<{
  milestones: TimelineMilestone[];
  integration: TimelineIntegrationMeta;
}> {
  assertAccessToken(accessToken);
  const current = await fetchTimeline(activityId, accessToken);

  for (let index = 0; index < drafts.length; index += 1) {
    await apiRequest<TimelineMilestoneResponse>(`/activities/${activityId}/timeline`, {
      method: 'POST',
      accessToken,
      body: toTimelinePayload(drafts[index], current.length + index),
    });
  }

  return {
    milestones: await fetchTimeline(activityId, accessToken),
    integration: getTimelineIntegrationMeta(),
  };
}

export async function createTimelineMilestone(
  activityId: string,
  draft: TimelineMilestoneDraft,
  accessToken?: string
): Promise<{
  milestone: TimelineMilestone;
  milestones: TimelineMilestone[];
  integration: TimelineIntegrationMeta;
}> {
  assertAccessToken(accessToken);
  const current = await fetchTimeline(activityId, accessToken);
  const response = await apiRequest<TimelineMilestoneResponse>(`/activities/${activityId}/timeline`, {
    method: 'POST',
    accessToken,
    body: toTimelinePayload(draft, current.length),
  });
  const milestone = normalizeTimelineItem(response.milestone ?? {}, activityId, current.length);
  const milestones = await fetchTimeline(activityId, accessToken);
  return {
    milestone,
    milestones,
    integration: getTimelineIntegrationMeta(),
  };
}

export async function updateTimelineMilestone(
  activityId: string,
  milestoneId: string,
  draft: TimelineMilestoneDraft,
  accessToken?: string
): Promise<{
  milestone: TimelineMilestone | null;
  milestones: TimelineMilestone[];
  integration: TimelineIntegrationMeta;
}> {
  assertAccessToken(accessToken);
  const currentMilestones = await fetchTimeline(activityId, accessToken);
  const current = currentMilestones.find((item) => item.id === milestoneId);
  const response = await apiRequest<TimelineMilestoneResponse>(`/activities/${activityId}/timeline/${milestoneId}`, {
    method: 'PATCH',
    accessToken,
    body: toTimelinePayload(draft, draft.orderIndex ?? current?.orderIndex ?? 0),
  });

  const milestones = await fetchTimeline(activityId, accessToken);
  const milestone = milestones.find((item) => item.id === milestoneId) ?? normalizeTimelineItem(response.milestone ?? null, activityId, 0);

  return {
    milestone,
    milestones,
    integration: getTimelineIntegrationMeta(),
  };
}

export async function updateTimelineMilestoneStatus(
  activityId: string,
  milestoneId: string,
  status: TimelineMilestoneStatus,
  accessToken?: string
): Promise<{
  milestone: TimelineMilestone | null;
  milestones: TimelineMilestone[];
  integration: TimelineIntegrationMeta;
}> {
  assertAccessToken(accessToken);
  const currentMilestones = await fetchTimeline(activityId, accessToken);
  const current = currentMilestones.find((item) => item.id === milestoneId);
  if (!current) {
    return {
      milestone: null,
      milestones: currentMilestones,
      integration: getTimelineIntegrationMeta(),
    };
  }

  await apiRequest<TimelineMilestoneResponse>(`/activities/${activityId}/timeline/${milestoneId}`, {
    method: 'PATCH',
    accessToken,
    body: {
      title: current.title,
      description: current.description,
      timelineChoice: current.startTime,
      startTime: current.startTime,
      endTime: current.endTime,
      orderIndex: current.orderIndex,
      type: current.type,
      status,
    },
  });

  const milestones = await fetchTimeline(activityId, accessToken);
  const milestone = milestones.find((item) => item.id === milestoneId) ?? null;
  return {
    milestone,
    milestones,
    integration: getTimelineIntegrationMeta(),
  };
}

export async function deleteTimelineMilestone(
  activityId: string,
  milestoneId: string,
  accessToken?: string
): Promise<{
  milestones: TimelineMilestone[];
  integration: TimelineIntegrationMeta;
}> {
  assertAccessToken(accessToken);
  await apiRequest<{ success: boolean }>(`/activities/${activityId}/timeline/${milestoneId}`, {
    method: 'DELETE',
    accessToken,
  });
  return {
    milestones: await fetchTimeline(activityId, accessToken),
    integration: getTimelineIntegrationMeta(),
  };
}

export async function moveTimelineMilestone(
  activityId: string,
  milestoneId: string,
  direction: 'up' | 'down',
  accessToken?: string
): Promise<{
  milestones: TimelineMilestone[];
  integration: TimelineIntegrationMeta;
}> {
  assertAccessToken(accessToken);
  const milestones = await fetchTimeline(activityId, accessToken);
  const currentIndex = milestones.findIndex((item) => item.id === milestoneId);
  if (currentIndex < 0) {
    return {
      milestones,
      integration: getTimelineIntegrationMeta(),
    };
  }

  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= milestones.length) {
    return {
      milestones,
      integration: getTimelineIntegrationMeta(),
    };
  }

  const reordered = [...milestones];
  const current = reordered[currentIndex];
  reordered[currentIndex] = reordered[targetIndex];
  reordered[targetIndex] = current;

  for (let index = 0; index < reordered.length; index += 1) {
    const item = reordered[index];
    await apiRequest<TimelineMilestoneResponse>(`/activities/${activityId}/timeline/${item.id}`, {
      method: 'PATCH',
      accessToken,
      body: {
        title: item.title,
        description: item.description,
        timelineChoice: item.startTime,
        startTime: item.startTime,
        endTime: item.endTime,
        orderIndex: index,
        type: item.type,
        status: item.status,
      },
    });
  }

  return {
    milestones: await fetchTimeline(activityId, accessToken),
    integration: getTimelineIntegrationMeta(),
  };
}
