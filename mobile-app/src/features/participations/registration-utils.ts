import type { ActiveParticipationForConflict } from './volunteer-participations-api';
import type { EnrichedParticipation } from './volunteer-participations-api';

// ─── Time conflict ────────────────────────────────────────────────────────────

export interface ConflictResult {
  conflicting: ActiveParticipationForConflict;
}

/**
 * Client-side half-open interval overlap test.
 * A conflict exists when: targetStart < existingEnd && existingStart < targetEnd.
 *
 * Returns the first conflicting candidate, or null.
 * Fails open (returns null) when target times are missing or invalid.
 */
export function findTimeConflict(
  target: { id: string; start_time: string; end_time: string },
  candidates: ActiveParticipationForConflict[],
): ConflictResult | null {
  const targetStart = new Date(target.start_time).getTime();
  const targetEnd = new Date(target.end_time).getTime();

  if (!Number.isFinite(targetStart) || !Number.isFinite(targetEnd) || targetStart >= targetEnd) {
    return null;
  }

  for (const c of candidates) {
    if (c.activityId === target.id) continue;
    if (!c.startTime || !c.endTime) continue;

    const cStart = new Date(c.startTime).getTime();
    const cEnd = new Date(c.endTime).getTime();

    if (!Number.isFinite(cStart) || !Number.isFinite(cEnd) || cStart >= cEnd) continue;

    if (targetStart < cEnd && cStart < targetEnd) {
      return { conflicting: c };
    }
  }

  return null;
}

// ─── Registration UI state ────────────────────────────────────────────────────

export type RegistrationUiState =
  | 'not_registered'
  | 'pending'
  | 'approved'
  | 'assigned'
  | 'checked_in'
  | 'rejected'
  | 'cancelled';

export function deriveRegistrationUiState(status: string | undefined | null): RegistrationUiState {
  switch (String(status ?? '').toLowerCase()) {
    case 'pending':
      return 'pending';
    case 'approved':
      return 'approved';
    case 'assigned':
      return 'assigned';
    case 'checked_in':
      return 'checked_in';
    case 'rejected':
      return 'rejected';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'not_registered';
  }
}

// ─── Home section grouping ────────────────────────────────────────────────────

const ACTIVE_STATUSES = new Set(['assigned', 'pending', 'approved', 'checked_in']);

export interface MyActivitiesSections {
  /** Active registrations (pending/approved/assigned/checked_in) sorted by start time ascending. */
  upcoming: EnrichedParticipation[];
  /** Most recent non-active registrations (rejected/cancelled/completed), capped at 3. */
  recent: EnrichedParticipation[];
}

export function buildMyActivitiesSections(
  participations: EnrichedParticipation[],
): MyActivitiesSections {
  const upcoming = participations
    .filter((p) => ACTIVE_STATUSES.has(String(p.status ?? '').toLowerCase()))
    .sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return da - db;
    });

  const recent = participations
    .filter((p) => !ACTIVE_STATUSES.has(String(p.status ?? '').toLowerCase()))
    .sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return db - da;
    })
    .slice(0, 3);

  return { upcoming, recent };
}
