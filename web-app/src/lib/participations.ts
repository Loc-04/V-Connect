import { apiRequest } from './api';
import type { ParticipationRecord, ParticipationStatus } from '../types/participation';

interface ParticipationResponse {
  participation: ParticipationRecord;
  created?: boolean;
  message?: string;
}

interface RegistrationResponse {
  registration?: ParticipationRecord;
  participation?: ParticipationRecord;
  created?: boolean;
  message?: string;
}

type VolunteerAssignmentDecision = 'accept' | 'decline';

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

export function normalizeParticipationRecord(record: ParticipationRecord): ParticipationRecord {
  const participationId = record.participationId || record.id;
  const activityId = record.activityId ?? record.activity_id ?? null;
  const activityName = record.activityName || 'Untitled Activity';
  const organization = record.organization || 'Organizer';
  const date = record.date ?? record.created_at ?? null;
  const hours = typeof record.hours === 'number' ? record.hours : null;
  const status = String(record.status ?? 'upcoming');
  const activityDeleted = Boolean(record.activityDeleted);
  const activityDeletedAt = record.activityDeletedAt ?? null;

  return {
    ...record,
    status,
    participationId,
    activityId,
    activityName,
    organization,
    date,
    hours,
    activityDeleted,
    activityDeletedAt,
    activity_id: record.activity_id ?? activityId ?? undefined,
  };
}

export function normalizeParticipationList(rows: ParticipationRecord[] | undefined): ParticipationRecord[] {
  return (rows ?? []).map((record) => normalizeParticipationRecord(record));
}

export async function listParticipations(accessToken: string, limit?: number): Promise<ParticipationRecord[]>;
export async function listParticipations(options: ListParticipationsOptions): Promise<ParticipationRecord[]>;
export async function listParticipations(
  arg1: string | ListParticipationsOptions,
  arg2?: number
): Promise<ParticipationRecord[]> {
  if (typeof arg1 === 'string') {
    const query = typeof arg2 === 'number' && Number.isFinite(arg2) ? `?limit=${Math.trunc(arg2)}` : '';
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
  accessToken: string,
  options: {
    recommendationItemId?: string | null;
  } = {}
): Promise<{ participation: ParticipationRecord; created: boolean; message?: string }> {
  const response = await apiRequest<RegistrationResponse>(`/activities/${activityId}/register`, {
    method: 'POST',
    accessToken,
    body: {
      recommendation_item_id: options.recommendationItemId ?? null,
    },
  });

  const participation = response.registration ?? response.participation;
  if (!participation) {
    throw new Error('Registration succeeded but no participation payload was returned.');
  }

  return {
    participation: normalizeParticipationRecord(participation),
    created: response.created !== false,
    message: response.message,
  };
}

export async function cancelParticipation(activityId: string, accessToken: string): Promise<ParticipationRecord> {
  const response = await apiRequest<RegistrationResponse>(`/activities/${activityId}/register`, {
    method: 'DELETE',
    accessToken,
  });

  const participation = response.registration ?? response.participation;
  if (!participation) {
    throw new Error('Cancel registration succeeded but no participation payload was returned.');
  }

  return normalizeParticipationRecord(participation);
}

export async function respondToAssignedParticipation(
  participationId: string,
  decision: VolunteerAssignmentDecision,
  accessToken: string
): Promise<{ registration: ParticipationRecord; message?: string }> {
  const response = await apiRequest<RegistrationResponse>(`/registrations/${participationId}/volunteer-response`, {
    method: 'PUT',
    accessToken,
    body: { decision },
  });

  const participation = response.registration ?? response.participation;
  if (!participation) {
    throw new Error('Assignment response succeeded but no registration payload was returned.');
  }

  return {
    registration: normalizeParticipationRecord(participation),
    message: response.message,
  };
}

export async function checkInParticipation(
  participationId: string,
  checkInCode: string,
  accessToken: string
): Promise<ParticipationRecord> {
  const normalizedParticipationId = participationId.trim();
  if (!normalizedParticipationId) {
    throw new Error('participationId is required.');
  }

  const normalizedCheckInCode = checkInCode.trim();
  if (!normalizedCheckInCode) {
    throw new Error('checkInCode is required.');
  }

  return checkInParticipationWithCode(normalizedParticipationId, accessToken, normalizedCheckInCode);
}

export async function checkInParticipationWithCode(
  participationId: string,
  accessToken: string,
  checkInCode?: string
): Promise<ParticipationRecord> {
  const response = await apiRequest<ParticipationResponse>(`/participations/${participationId}/check-in`, {
    method: 'POST',
    accessToken,
    body: checkInCode ? { checkInCode } : {},
  });

  return normalizeParticipationRecord(response.participation);
}

export async function checkInParticipationByCode(
  activityId: string,
  checkInCode: string,
  accessToken: string
): Promise<ParticipationRecord> {
  const response = await apiRequest<ParticipationResponse>(`/activities/${activityId}/check-in-by-code`, {
    method: 'POST',
    accessToken,
    body: { checkInCode },
  });

  return normalizeParticipationRecord(response.participation);
}
