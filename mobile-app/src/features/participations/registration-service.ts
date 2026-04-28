import { apiRequest } from '@/src/data/clients';

const ACTIVE_STATUSES = new Set(['assigned', 'pending', 'approved', 'checked_in']);

export interface RegisterForActivityResult {
  registration: unknown;
  created: boolean;
  message?: string;
}

export async function registerForActivity(activityId: string): Promise<RegisterForActivityResult> {
  return apiRequest<RegisterForActivityResult>(`/activities/${activityId}/register`, { method: 'POST' });
}

export async function cancelActivityRegistration(activityId: string): Promise<{ registration?: unknown; message?: string }> {
  return apiRequest(`/activities/${activityId}/register`, { method: 'DELETE' });
}

export interface ParticipationRow {
  id: string;
  activity_id: string;
  status: string;
}

interface ParticipationsResponse {
  participations: ParticipationRow[];
}

export interface ParticipationVolunteerSummary {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: string | null;
}

export interface OrganizerRegistrationItem extends ParticipationRow {
  ai_match_score?: number | null;
  activityName?: string | null;
  organization?: string | null;
  date?: string | null;
  hours?: number | null;
  volunteer?: ParticipationVolunteerSummary | null;
}

interface OrganizerRegistrationsResponse {
  participations: OrganizerRegistrationItem[];
}

interface RegistrationActionResponse {
  registration: OrganizerRegistrationItem;
  message?: string;
}

/** Latest participation row for this activity for the current user (volunteer). */
export async function fetchMyParticipationForActivity(activityId: string): Promise<ParticipationRow | null> {
  const params = new URLSearchParams({
    activityId,
    limit: '10',
  });
  const res = await apiRequest<ParticipationsResponse>(`/participations?${params.toString()}`);
  const list = res.participations ?? [];
  const active = list.find((p) => ACTIVE_STATUSES.has(String(p.status ?? '').toLowerCase()));
  return active ?? null;
}

export interface ParticipationStatusForActivity {
  /** Active participation (assigned/pending/approved/checked_in), or null if none. */
  active: ParticipationRow | null;
  /** Most recent non-active row (rejected/cancelled) when no active exists, for prior-status display. */
  prior: ParticipationRow | null;
}

/**
 * Single-call replacement for fetchMyParticipationForActivity that also surfaces
 * a rejected/cancelled prior registration so the UI can show contextual hints.
 */
export async function fetchMyParticipationStatusForActivity(
  activityId: string,
): Promise<ParticipationStatusForActivity> {
  const params = new URLSearchParams({ activityId, limit: '10' });
  const res = await apiRequest<ParticipationsResponse>(`/participations?${params.toString()}`);
  const list = res.participations ?? [];
  const active = list.find((p) => ACTIVE_STATUSES.has(String(p.status ?? '').toLowerCase())) ?? null;
  const prior = active === null ? (list[0] ?? null) : null;
  return { active, prior };
}

export function isActiveParticipationStatus(status: string | undefined): boolean {
  return ACTIVE_STATUSES.has(String(status ?? '').toLowerCase());
}

export async function fetchPendingRegistrationsForOrganizer(limit = 100): Promise<OrganizerRegistrationItem[]> {
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 300) : 100;
  const params = new URLSearchParams({
    status: 'pending',
    mine: 'true',
    limit: String(safeLimit),
  });
  const res = await apiRequest<OrganizerRegistrationsResponse>(`/participations?${params.toString()}`);
  return res.participations ?? [];
}

export async function approveRegistration(participationId: string): Promise<RegistrationActionResponse> {
  return apiRequest<RegistrationActionResponse>(`/registrations/${participationId}/approve`, {
    method: 'PUT',
  });
}

export async function rejectRegistration(participationId: string): Promise<RegistrationActionResponse> {
  return apiRequest<RegistrationActionResponse>(`/registrations/${participationId}/reject`, {
    method: 'PUT',
  });
}
