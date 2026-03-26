import { apiRequest } from '@/src/data/clients';
import type { ActivityPayload, ActivityRecord, ActivityStatus } from '../types';

interface ActivitiesResponse {
  activities: ActivityRecord[];
}

interface ActivityResponse {
  activity: ActivityRecord;
}

interface DeleteActivityResponse {
  success: boolean;
  message: string;
}

export interface ListActivitiesOptions {
  mine?: boolean;
  status?: ActivityStatus | 'all';
  search?: string;
  limit?: number;
}

function buildQuery(options: ListActivitiesOptions): string {
  const params = new URLSearchParams();
  if (options.mine !== undefined) params.set('mine', String(options.mine));
  if (options.status) params.set('status', options.status);
  if (options.search) params.set('search', options.search);
  if (options.limit) params.set('limit', String(options.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export async function listActivities(options: ListActivitiesOptions = {}): Promise<ActivityRecord[]> {
  const res = await apiRequest<ActivitiesResponse>(`/activities${buildQuery(options)}`);
  return res.activities;
}

export async function getActivity(id: string): Promise<ActivityRecord> {
  const res = await apiRequest<ActivityResponse>(`/activities/${id}`);
  return res.activity;
}

export async function createActivity(payload: ActivityPayload): Promise<ActivityRecord> {
  const res = await apiRequest<ActivityResponse>('/activities', { method: 'POST', body: payload });
  return res.activity;
}

export async function updateActivity(
  id: string,
  payload: Partial<ActivityPayload>,
): Promise<ActivityRecord> {
  const res = await apiRequest<ActivityResponse>(`/activities/${id}`, {
    method: 'PATCH',
    body: payload,
  });
  return res.activity;
}

export async function deleteActivity(id: string): Promise<DeleteActivityResponse> {
  return apiRequest<DeleteActivityResponse>(`/activities/${id}`, { method: 'DELETE' });
}
