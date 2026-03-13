import { apiRequest } from './api';
import type { ParticipationRecord, ParticipationStatus } from '../types/participation';

interface ParticipationResponse {
  participation: ParticipationRecord;
  created?: boolean;
  message?: string;
}

interface ParticipationListResponse {
  participations: ParticipationRecord[];
}

export interface ListParticipationsOptions {
  accessToken: string;
  mine?: boolean;
  activityId?: string;
  status?: ParticipationStatus | 'all';
  limit?: number;
}

function createQueryString(options: Omit<ListParticipationsOptions, 'accessToken'>) {
  const params = new URLSearchParams();

  if (typeof options.mine === 'boolean') {
    params.set('mine', String(options.mine));
  }

  if (options.activityId) {
    params.set('activityId', options.activityId);
  }

  if (options.status) {
    params.set('status', options.status);
  }

  if (typeof options.limit === 'number' && Number.isFinite(options.limit)) {
    params.set('limit', String(Math.trunc(options.limit)));
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function listParticipations(options: ListParticipationsOptions): Promise<ParticipationRecord[]> {
  const query = createQueryString({
    mine: options.mine,
    activityId: options.activityId,
    status: options.status,
    limit: options.limit,
  });

  const response = await apiRequest<ParticipationListResponse>(`/participations${query}`, {
    accessToken: options.accessToken,
  });

  return response.participations;
}

export async function createParticipation(
  activityId: string,
  accessToken: string
): Promise<{ participation: ParticipationRecord; created: boolean; message?: string }> {
  const response = await apiRequest<ParticipationResponse>('/participations', {
    method: 'POST',
    accessToken,
    body: { activityId },
  });

  return {
    participation: response.participation,
    created: response.created !== false,
    message: response.message,
  };
}

export async function checkInParticipation(participationId: string, accessToken: string): Promise<ParticipationRecord> {
  const response = await apiRequest<ParticipationResponse>(`/participations/${participationId}/check-in`, {
    method: 'POST',
    accessToken,
  });

  return response.participation;
}
