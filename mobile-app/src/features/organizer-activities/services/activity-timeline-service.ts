import { apiRequest } from '@/src/data/clients';

export interface TimelineMilestoneRow {
  id: string;
  activity_id: string;
  title: string;
  description: string | null;
  timeline_choice: string;
  created_at: string;
}

export interface TimelineCreatePayload {
  title: string;
  description?: string;
  timelineChoice: string;
}

export interface TimelineUpdatePayload {
  title?: string;
  description?: string;
  timelineChoice?: string;
}

interface TimelineListResponse {
  timeline: TimelineMilestoneRow[];
}

interface TimelineMilestoneResponse {
  milestone: TimelineMilestoneRow;
}

interface TimelineDeleteResponse {
  success: boolean;
}

export async function listActivityTimeline(activityId: string): Promise<TimelineMilestoneRow[]> {
  const res = await apiRequest<TimelineListResponse>(`/activities/${activityId}/timeline`);
  return res.timeline ?? [];
}

export async function createActivityTimelineItem(
  activityId: string,
  payload: TimelineCreatePayload,
): Promise<TimelineMilestoneRow> {
  const res = await apiRequest<TimelineMilestoneResponse>(`/activities/${activityId}/timeline`, {
    method: 'POST',
    body: payload,
  });
  return res.milestone;
}

export async function updateActivityTimelineItem(
  activityId: string,
  timelineId: string,
  payload: TimelineUpdatePayload,
): Promise<TimelineMilestoneRow> {
  const res = await apiRequest<TimelineMilestoneResponse>(
    `/activities/${activityId}/timeline/${timelineId}`,
    { method: 'PATCH', body: payload },
  );
  return res.milestone;
}

export async function deleteActivityTimelineItem(
  activityId: string,
  timelineId: string,
): Promise<void> {
  await apiRequest<TimelineDeleteResponse>(
    `/activities/${activityId}/timeline/${timelineId}`,
    { method: 'DELETE' },
  );
}
