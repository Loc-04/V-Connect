import { apiRequest } from './api';
import type { ActivityPayload, ActivityRecord, ActivityStatus } from '../types/activity';

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
  accessToken: string;
  mine?: boolean;
  status?: ActivityStatus | 'all';
  search?: string;
  limit?: number;
}

export interface SearchActivitiesOptions extends ListActivitiesOptions {
  keyword?: string;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  skill?: string;
  location?: string;
}

function createQueryString(options: Omit<SearchActivitiesOptions, 'accessToken'>) {
  const params = new URLSearchParams();

  if (typeof options.mine === 'boolean') {
    params.set('mine', String(options.mine));
  }

  if (options.status) {
    params.set('status', options.status);
  }

  if (options.search) {
    params.set('search', options.search);
  }

  if (options.keyword) {
    params.set('keyword', options.keyword);
  }

  if (options.date) {
    params.set('date', options.date);
  }

  if (options.dateFrom) {
    params.set('dateFrom', options.dateFrom);
  }

  if (options.dateTo) {
    params.set('dateTo', options.dateTo);
  }

  if (options.skill) {
    params.set('skill', options.skill);
  }

  if (options.location) {
    params.set('location', options.location);
  }

  if (options.limit) {
    params.set('limit', String(options.limit));
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function listActivities(options: ListActivitiesOptions): Promise<ActivityRecord[]> {
  const query = createQueryString({
    mine: options.mine,
    status: options.status,
    search: options.search,
    limit: options.limit,
  });

  const response = await apiRequest<ActivitiesResponse>(`/activities${query}`, {
    accessToken: options.accessToken,
  });

  return response.activities;
}

export async function searchActivities(options: SearchActivitiesOptions): Promise<ActivityRecord[]> {
  const query = createQueryString({
    mine: options.mine,
    status: options.status,
    search: options.search,
    keyword: options.keyword,
    date: options.date,
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
    skill: options.skill,
    location: options.location,
    limit: options.limit,
  });

  const response = await apiRequest<ActivitiesResponse>(`/activities/search${query}`, {
    accessToken: options.accessToken,
  });

  return response.activities;
}

export async function getActivityById(activityId: string, accessToken: string): Promise<ActivityRecord> {
  const response = await apiRequest<ActivityResponse>(`/activities/${activityId}`, {
    accessToken,
  });

  return response.activity;
}

export async function createActivity(
  payload: ActivityPayload,
  accessToken: string
): Promise<ActivityRecord> {
  const response = await apiRequest<ActivityResponse>('/activities', {
    method: 'POST',
    accessToken,
    body: payload,
  });

  return response.activity;
}

export async function updateActivity(
  activityId: string,
  payload: Partial<ActivityPayload>,
  accessToken: string
): Promise<ActivityRecord> {
  const response = await apiRequest<ActivityResponse>(`/activities/${activityId}`, {
    method: 'PATCH',
    accessToken,
    body: payload,
  });

  return response.activity;
}

export async function deleteActivity(activityId: string, accessToken: string): Promise<DeleteActivityResponse> {
  return apiRequest<DeleteActivityResponse>(`/activities/${activityId}`, {
    method: 'DELETE',
    accessToken,
  });
}
