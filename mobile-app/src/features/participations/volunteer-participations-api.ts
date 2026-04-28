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
const ACTIVE_CONFLICT_STATUSES = new Set(['assigned', 'pending', 'approved', 'checked_in']);

/** True if the volunteer has approved or checked-in participation on a different activity (blocks new registrations). */
export async function hasApprovedParticipationElsewhere(activityId: string): Promise<boolean> {
  const rows = await fetchMyParticipations({ status: 'all', limit: 200 });
  return rows.some(
    (p) =>
      p.activity_id !== activityId && COMMITTED_STATUSES.has(String(p.status ?? '').toLowerCase()),
  );
}

/**
 * Normalised shape used for client-side time-overlap conflict detection.
 * startTime and endTime are derived from the enriched participation's `date` (activity start)
 * and `hours` (computed duration). Either may be null when the backend omits the values.
 */
export interface ActiveParticipationForConflict {
  participationId: string;
  activityId: string;
  activityName: string;
  status: string;
  startTime: string | null;
  endTime: string | null;
}

/**
 * Fetches all active participations for the current volunteer and normalises them
 * into time windows suitable for client-side overlap checking.
 */
export async function fetchActiveParticipationsForConflict(): Promise<ActiveParticipationForConflict[]> {
  const all = await fetchMyParticipations({ status: 'all', limit: 200 });
  return all
    .filter((p) => ACTIVE_CONFLICT_STATUSES.has(String(p.status ?? '').toLowerCase()))
    .map((p) => {
      const startMs = p.date ? new Date(p.date).getTime() : null;
      const endMs =
        startMs != null && p.hours != null && Number.isFinite(p.hours) && p.hours > 0
          ? startMs + p.hours * 3_600_000
          : null;
      return {
        participationId: p.id,
        activityId: p.activity_id,
        activityName: p.activityName ?? 'Unknown activity',
        status: String(p.status ?? ''),
        startTime: startMs != null && Number.isFinite(startMs) ? new Date(startMs).toISOString() : null,
        endTime: endMs != null && Number.isFinite(endMs) ? new Date(endMs).toISOString() : null,
      };
    });
}
