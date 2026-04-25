import type { TimelineMilestoneRow } from './services/activity-timeline-service';

export interface ActivityTimelineEntry {
  /** React key. For server-backed rows this equals `serverId`. */
  id: string;
  /** Present when the row exists on the backend. Absent for unsaved rows. */
  serverId?: string;
  title: string;
  /** ISO datetime of the milestone moment (backend `timeline_choice`). */
  at: string;
  description?: string;
}

function localDayKey(iso: string | Date): string | null {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function activityDayKeys(start: Date, end: Date): Set<string> {
  const keys = new Set<string>();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return keys;
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor.getTime() <= last.getTime()) {
    const key = localDayKey(cursor);
    if (key) keys.add(key);
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

export function createTimelineEntryId(): string {
  return `tl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function sortTimelineEntries(entries: ActivityTimelineEntry[]): ActivityTimelineEntry[] {
  return [...entries].sort((a, b) => {
    const ta = new Date(a.at).getTime();
    const tb = new Date(b.at).getTime();
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return ta - tb;
  });
}

/**
 * Validate timeline entries against activity bounds using local calendar days.
 * Rules:
 *   - every entry must have a title and a parseable `at`
 *   - every `at` must fall within [start, end] inclusive
 *   - the set of calendar days touched by entries must be a subset of the
 *     activity's day set (so the timeline never spans more days than the activity)
 * Uses device local timezone, matching the rest of the create/edit form.
 */
export function validateActivityTimeline(
  entries: ActivityTimelineEntry[],
  start: Date | string,
  end: Date | string,
): string | null {
  const startDate = start instanceof Date ? start : new Date(start);
  const endDate = end instanceof Date ? end : new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return 'Set activity start and end before editing the timeline.';
  }
  if (endDate.getTime() <= startDate.getTime()) {
    return 'Activity end must be later than start before adding timeline entries.';
  }

  const allowedDays = activityDayKeys(startDate, endDate);
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const label = entry.title?.trim() ? `"${entry.title.trim()}"` : `Entry ${i + 1}`;

    if (!entry.title || !entry.title.trim()) {
      return `Entry ${i + 1} needs a title.`;
    }
    const at = new Date(entry.at);
    if (Number.isNaN(at.getTime())) {
      return `${label} has an invalid date/time.`;
    }
    const ms = at.getTime();
    if (ms < startMs || ms > endMs) {
      return `${label} must be between the activity start and end.`;
    }
    const dayKey = localDayKey(at);
    if (!dayKey || !allowedDays.has(dayKey)) {
      return `${label} is on a day outside the activity window.`;
    }
  }

  return null;
}

/** Map a backend timeline row to the shape consumed by the editor/list UI. */
export function mapServerRowToEntry(row: TimelineMilestoneRow): ActivityTimelineEntry {
  return {
    id: row.id,
    serverId: row.id,
    title: row.title ?? '',
    at: row.timeline_choice,
    description: row.description ?? '',
  };
}

export function mapServerRowsToEntries(rows: TimelineMilestoneRow[]): ActivityTimelineEntry[] {
  return sortTimelineEntries(rows.map(mapServerRowToEntry));
}
