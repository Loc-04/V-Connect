/**
 * Weekly availability grid + 21 canonical slot ids persisted in `volunteer_profiles.available_choices`.
 */

import type { AvailabilityMap } from '@/src/features/profile/types';

export const DAY_COLUMN_KEYS = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
] as const;

export type DayColumnKey = (typeof DAY_COLUMN_KEYS)[number];

export const TIME_BAND_IDS = ['morning', 'afternoon', 'evening'] as const;

export type TimeBandId = (typeof TIME_BAND_IDS)[number];

const BAND_SUFFIX: Record<TimeBandId, 'mor' | 'aft' | 'eve'> = {
  morning: 'mor',
  afternoon: 'aft',
  evening: 'eve',
};

/** All 21 keys in stable order (days × bands). */
export const AVAILABILITY_SLOT_KEYS = [
  'mon_mor',
  'mon_aft',
  'mon_eve',
  'tue_mor',
  'tue_aft',
  'tue_eve',
  'wed_mor',
  'wed_aft',
  'wed_eve',
  'thu_mor',
  'thu_aft',
  'thu_eve',
  'fri_mor',
  'fri_aft',
  'fri_eve',
  'sat_mor',
  'sat_aft',
  'sat_eve',
  'sun_mor',
  'sun_aft',
  'sun_eve',
] as const;

export type AvailabilitySlotKey = (typeof AVAILABILITY_SLOT_KEYS)[number];

const SLOT_KEY_SET = new Set<string>(AVAILABILITY_SLOT_KEYS);

export function isAvailabilitySlotKey(value: string): value is AvailabilitySlotKey {
  return SLOT_KEY_SET.has(value);
}

export function slotId(day: DayColumnKey, band: TimeBandId): AvailabilitySlotKey {
  return `${day}_${BAND_SUFFIX[band]}` as AvailabilitySlotKey;
}

/** Row metadata (labels may later come from API i18n or config). */
export interface TimeBandDefinition {
  id: TimeBandId;
  label: string;
}

export const DEFAULT_TIME_BANDS: TimeBandDefinition[] = [
  { id: 'morning', label: 'Morning' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening', label: 'Evening' },
];

export interface DayColumnDefinition {
  key: DayColumnKey;
  shortLabel: string;
}

export const DEFAULT_DAY_COLUMNS: DayColumnDefinition[] = [
  { key: 'mon', shortLabel: 'Mon' },
  { key: 'tue', shortLabel: 'Tue' },
  { key: 'wed', shortLabel: 'Wed' },
  { key: 'thu', shortLabel: 'Thu' },
  { key: 'fri', shortLabel: 'Fri' },
  { key: 'sat', shortLabel: 'Sat' },
  { key: 'sun', shortLabel: 'Sun' },
];

/** availability[band][day] === true means user is available in that slot. */
export type WeeklyAvailabilityMatrix = Record<TimeBandId, Record<DayColumnKey, boolean>>;

export function createEmptyWeeklyAvailabilityMatrix(): WeeklyAvailabilityMatrix {
  const row = (): Record<DayColumnKey, boolean> =>
    DAY_COLUMN_KEYS.reduce(
      (acc, key) => {
        acc[key] = false;
        return acc;
      },
      {} as Record<DayColumnKey, boolean>,
    );

  return {
    morning: row(),
    afternoon: row(),
    evening: row(),
  };
}

/** Empty selection list (e.g. reset before collecting). */
export function createEmptySelectedSlots(): AvailabilitySlotKey[] {
  return [];
}

/** Unique keys in canonical `AVAILABILITY_SLOT_KEYS` order. */
export function dedupeSortSlots(slots: string[]): AvailabilitySlotKey[] {
  const seen = new Set<AvailabilitySlotKey>();
  for (const s of slots) {
    if (isAvailabilitySlotKey(s)) {
      seen.add(s);
    }
  }
  return AVAILABILITY_SLOT_KEYS.filter((k) => seen.has(k));
}

/** Collect selected slot ids from the matrix (immutable new array). */
export function collectSelectedSlotKeys(matrix: WeeklyAvailabilityMatrix): AvailabilitySlotKey[] {
  const out: AvailabilitySlotKey[] = [];
  for (const band of TIME_BAND_IDS) {
    for (const day of DAY_COLUMN_KEYS) {
      if (matrix[band][day]) {
        out.push(slotId(day, band));
      }
    }
  }
  return dedupeSortSlots(out);
}

/** Hydrate matrix from DB array; unknown strings ignored. */
export function matrixFromSelectedSlotKeys(slots: string[]): WeeklyAvailabilityMatrix {
  const selected = new Set(dedupeSortSlots(slots));
  const m = createEmptyWeeklyAvailabilityMatrix();
  for (const band of TIME_BAND_IDS) {
    for (const day of DAY_COLUMN_KEYS) {
      if (selected.has(slotId(day, band))) {
        m[band][day] = true;
      }
    }
  }
  return m;
}

/** Coarse per-day booleans for profile summary (day true if any slot that day is selected). */
export function dayAvailabilityFromSlotKeys(slots: string[] | null | undefined): AvailabilityMap {
  const list = Array.isArray(slots) ? slots : [];
  const selected = new Set(dedupeSortSlots(list));
  const dayHasSlot = (day: DayColumnKey) =>
    (['mor', 'aft', 'eve'] as const).some((suf) => selected.has(`${day}_${suf}` as AvailabilitySlotKey));

  return {
    mon: dayHasSlot('mon'),
    tue: dayHasSlot('tue'),
    wed: dayHasSlot('wed'),
    thu: dayHasSlot('thu'),
    fri: dayHasSlot('fri'),
    sat: dayHasSlot('sat'),
    sun: dayHasSlot('sun'),
  };
}
