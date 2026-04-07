import { apiRequest } from '@/src/data/clients';

import type { ParticipationRow, ParticipationVolunteerSummary } from './registration-service';

export interface ParticipationHistoryEntry {
  id: string;
  participationId: string;
  activityId: string;
  activityName: string;
  organization: string;
  date: string | null;
  hours: number | null;
  status: string;
  activityDeleted: boolean;
  activityDeletedAt: string | null;
}

interface ParticipationHistoryResponse {
  participations: ParticipationHistoryEntry[];
}

export interface EnrichedParticipation extends ParticipationRow {
  ai_match_score?: number | null;
  activityName?: string | null;
  organization?: string | null;
  date?: string | null;
  hours?: number | null;
  volunteer?: ParticipationVolunteerSummary | null;
}

interface ParticipationsListResponse {
  participations: EnrichedParticipation[];
}

interface SingleRegistrationResponse {
  registration: EnrichedParticipation;
}

export type ParticipationStatusFilter =
  | 'all'
  | 'assigned'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'checked_in'
  | 'cancelled';

export async function fetchParticipationHistory(limit = 50): Promise<ParticipationHistoryEntry[]> {
  const safe = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 200) : 50;
  const res = await apiRequest<ParticipationHistoryResponse>(`/participation-history?limit=${safe}`);
  return res.participations ?? [];
}

export async function fetchMyParticipations(options: {
  status?: ParticipationStatusFilter;
  activityId?: string;
  limit?: number;
} = {}): Promise<EnrichedParticipation[]> {
  const params = new URLSearchParams();
  const lim = options.limit ?? 100;
  const safeLimit = Number.isFinite(lim) ? Math.min(Math.max(Math.trunc(lim), 1), 300) : 100;
  params.set('limit', String(safeLimit));
  params.set('mine', 'true');
  if (options.status && options.status !== 'all') {
    params.set('status', options.status);
  }
  if (options.activityId) {
    params.set('activityId', options.activityId);
  }
  const res = await apiRequest<ParticipationsListResponse>(`/participations?${params.toString()}`);
  return res.participations ?? [];
}

export async function fetchRegistrationById(registrationId: string): Promise<EnrichedParticipation> {
  const res = await apiRequest<SingleRegistrationResponse>(`/registrations/${registrationId}`);
  return res.registration;
}

const COMMITTED_STATUSES = new Set(['approved', 'checked_in']);

/** True if the volunteer has approved or checked-in participation on a different activity (blocks new registrations). */
export async function hasApprovedParticipationElsewhere(activityId: string): Promise<boolean> {
  const rows = await fetchMyParticipations({ status: 'all', limit: 200 });
  return rows.some(
    (p) =>
      p.activity_id !== activityId && COMMITTED_STATUSES.has(String(p.status ?? '').toLowerCase()),
  );
}
