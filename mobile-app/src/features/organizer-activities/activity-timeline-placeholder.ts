// TODO(backend): Replace this whole module with GET/PATCH activity timeline from
// the API once available. Today the timeline is UI-only and persisted locally
// via AsyncStorage so organizer edits can be previewed on the same device.
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ActivityRecord } from './types';

export interface ActivityTimelineEntry {
  id: string;
  title: string;
  at: string;
}

const STORAGE_PREFIX = 'v-connect:activity-timeline:';

function storageKey(activityId: string): string {
  return `${STORAGE_PREFIX}${activityId}`;
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

/**
 * Deterministic read-only timeline used when nothing is stored for an activity.
 * TODO(backend): replace with real agenda rows returned from the API.
 */
export function buildFallbackTimeline(activity: ActivityRecord): ActivityTimelineEntry[] {
  const entries: ActivityTimelineEntry[] = [];
  const start = new Date(activity.start_time);
  const end = new Date(activity.end_time);
  if (!Number.isNaN(start.getTime())) {
    entries.push({ id: `${activity.id}:start`, title: 'Activity starts', at: start.toISOString() });
  }
  if (!Number.isNaN(end.getTime()) && end.getTime() > start.getTime()) {
    entries.push({ id: `${activity.id}:end`, title: 'Activity ends', at: end.toISOString() });
  }
  return entries;
}

/**
 * Merge stored placeholder entries with fallback rows. Stored entries are used
 * when non-empty and still valid against the current activity window, otherwise
 * callers see the deterministic fallback instead of stale/broken data.
 */
export function mergeDisplayTimeline(
  stored: ActivityTimelineEntry[] | null | undefined,
  activity: ActivityRecord,
): ActivityTimelineEntry[] {
  if (!stored || stored.length === 0) return buildFallbackTimeline(activity);
  const err = validateActivityTimeline(stored, activity.start_time, activity.end_time);
  if (err) return buildFallbackTimeline(activity);
  return sortTimelineEntries(stored);
}

// TODO(backend): remove local persistence when API exists.
export async function loadTimelinePlaceholder(
  activityId: string,
): Promise<ActivityTimelineEntry[]> {
  if (!activityId) return [];
  try {
    const raw = await AsyncStorage.getItem(storageKey(activityId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e): e is ActivityTimelineEntry =>
        !!e &&
        typeof e === 'object' &&
        typeof (e as ActivityTimelineEntry).id === 'string' &&
        typeof (e as ActivityTimelineEntry).title === 'string' &&
        typeof (e as ActivityTimelineEntry).at === 'string',
      )
      .map((e) => ({ id: e.id, title: e.title, at: e.at }));
  } catch {
    return [];
  }
}

// TODO(backend): remove local persistence when API exists.
export async function saveTimelinePlaceholder(
  activityId: string,
  entries: ActivityTimelineEntry[],
): Promise<void> {
  if (!activityId) return;
  try {
    if (!entries || entries.length === 0) {
      await AsyncStorage.removeItem(storageKey(activityId));
      return;
    }
    await AsyncStorage.setItem(storageKey(activityId), JSON.stringify(entries));
  } catch {
    // Swallow storage errors; placeholder persistence is best-effort.
  }
}

// TODO(backend): remove local persistence when API exists.
export async function clearTimelinePlaceholder(activityId: string): Promise<void> {
  if (!activityId) return;
  try {
    await AsyncStorage.removeItem(storageKey(activityId));
  } catch {
    // Best-effort clear.
  }
}
