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

function normalizeParticipationRecord(record: ParticipationRecord): ParticipationRecord {
  const participationId = record.participationId || record.id;
  const activityId = record.activityId ?? record.activity_id ?? null;
  const activityName = record.activityName || 'Untitled Activity';
  const organization = record.organization || 'Organizer';
  const date = record.date ?? record.created_at ?? null;
  const hours = typeof record.hours === 'number' ? record.hours : null;
  const status = String(record.status ?? 'upcoming');

  return {
    ...record,
    status,
    participationId,
    activityId,
    activityName,
    organization,
    date,
    hours,
    activity_id: record.activity_id ?? activityId ?? undefined,
  };
}

function normalizeParticipationList(rows: ParticipationRecord[] | undefined): ParticipationRecord[] {
  return (rows ?? []).map((record) => normalizeParticipationRecord(record));
}

export async function listParticipations(accessToken: string, limit?: number): Promise<ParticipationRecord[]>;
export async function listParticipations(options: ListParticipationsOptions): Promise<ParticipationRecord[]>;
export async function listParticipations(
  arg1: string | ListParticipationsOptions,
  arg2?: number
): Promise<ParticipationRecord[]> {
  if (typeof arg1 === 'string') {
    const query = Number.isFinite(arg2) ? `?limit=${Math.trunc(arg2)}` : '';
    const response = await apiRequest<ParticipationListResponse>(`/participation-history${query}`, {
      accessToken: arg1,
    });
    return normalizeParticipationList(response.participations);
  }

  const query = createQueryString({
    mine: arg1.mine,
    activityId: arg1.activityId,
    status: arg1.status,
    limit: arg1.limit,
  });

  const response = await apiRequest<ParticipationListResponse>(`/participations${query}`, {
    accessToken: arg1.accessToken,
  });

  return normalizeParticipationList(response.participations);
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
    participation: normalizeParticipationRecord(response.participation),
    created: response.created !== false,
    message: response.message,
  };
}

export async function checkInParticipation(participationId: string, accessToken: string): Promise<ParticipationRecord> {
  const response = await apiRequest<ParticipationResponse>(`/participations/${participationId}/check-in`, {
    method: 'POST',
    accessToken,
  });

  return normalizeParticipationRecord(response.participation);
}
