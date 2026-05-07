import type { AvailabilityGridDay, AvailabilityGridRow } from '../types/profile';

export const fallbackAvailabilityDays: AvailabilityGridDay[] = [
  { key: 'mon', label: 'Mon', fullLabel: 'Monday' },
  { key: 'tue', label: 'Tue', fullLabel: 'Tuesday' },
  { key: 'wed', label: 'Wed', fullLabel: 'Wednesday' },
  { key: 'thu', label: 'Thu', fullLabel: 'Thursday' },
  { key: 'fri', label: 'Fri', fullLabel: 'Friday' },
  { key: 'sat', label: 'Sat', fullLabel: 'Saturday' },
  { key: 'sun', label: 'Sun', fullLabel: 'Sunday' },
];

export const fallbackAvailabilityRows: AvailabilityGridRow[] = [
  { key: 'mor', label: 'Morning', fullLabel: 'Morning' },
  { key: 'aft', label: 'Afternoon', fullLabel: 'Afternoon' },
  { key: 'eve', label: 'Evening', fullLabel: 'Evening' },
];

const dayAliases = new Map([
  ['mon', 'mon'],
  ['monday', 'mon'],
  ['tue', 'tue'],
  ['tues', 'tue'],
  ['tuesday', 'tue'],
  ['wed', 'wed'],
  ['wednesday', 'wed'],
  ['thu', 'thu'],
  ['thursday', 'thu'],
  ['fri', 'fri'],
  ['friday', 'fri'],
  ['sat', 'sat'],
  ['saturday', 'sat'],
  ['sun', 'sun'],
  ['sunday', 'sun'],
]);

const sessionAliases = new Map([
  ['mor', 'mor'],
  ['morning', 'mor'],
  ['aft', 'aft'],
  ['afternoon', 'aft'],
  ['eve', 'eve'],
  ['evening', 'eve'],
]);

const dayIndex = new Map(fallbackAvailabilityDays.map((day, index) => [day.key, index]));
const rowIndex = new Map(fallbackAvailabilityRows.map((row, index) => [row.key, index]));

export interface QuickAvailabilityOption {
  key: 'weekdays' | 'weekends' | 'evenings';
  label: string;
  description: string;
}

export const quickAvailabilityOptions: QuickAvailabilityOption[] = [
  {
    key: 'weekdays',
    label: 'Weekdays',
    description: 'Select Monday to Friday for morning and afternoon shifts.',
  },
  {
    key: 'weekends',
    label: 'Weekends',
    description: 'Select Saturday and Sunday for morning and afternoon shifts.',
  },
  {
    key: 'evenings',
    label: 'Evenings',
    description: 'Select evening slots across the full week.',
  },
];

export function toAvailabilityChoice(dayKey: string, rowKey: string): string {
  return `${dayKey}_${rowKey}`;
}

export function getQuickAvailabilityChoices(
  quickChoice: QuickAvailabilityOption['key'],
  days: AvailabilityGridDay[] = fallbackAvailabilityDays
): string[] {
  const dayKeys = days.map((day) => day.key);
  const slots: string[] = [];

  if (quickChoice === 'weekdays') {
    for (const dayKey of dayKeys.filter((day) => !['sat', 'sun'].includes(day))) {
      slots.push(toAvailabilityChoice(dayKey, 'mor'), toAvailabilityChoice(dayKey, 'aft'));
    }
  }

  if (quickChoice === 'weekends') {
    for (const dayKey of dayKeys.filter((day) => ['sat', 'sun'].includes(day))) {
      slots.push(toAvailabilityChoice(dayKey, 'mor'), toAvailabilityChoice(dayKey, 'aft'));
    }
  }

  if (quickChoice === 'evenings') {
    for (const dayKey of dayKeys) {
      slots.push(toAvailabilityChoice(dayKey, 'eve'));
    }
  }

  return normalizeAvailableChoices(slots);
}

export function isQuickAvailabilitySelected(
  selectedChoices: string[],
  quickChoice: QuickAvailabilityOption['key'],
  days: AvailabilityGridDay[] = fallbackAvailabilityDays
): boolean {
  const normalized = new Set(normalizeAvailableChoices(selectedChoices));
  const quickSlots = getQuickAvailabilityChoices(quickChoice, days);

  return quickSlots.length > 0 && quickSlots.every((slot) => normalized.has(slot));
}

export function toggleQuickAvailabilitySelection(
  selectedChoices: string[],
  quickChoice: QuickAvailabilityOption['key'],
  days: AvailabilityGridDay[] = fallbackAvailabilityDays
): string[] {
  const normalized = normalizeAvailableChoices(selectedChoices);
  const quickSlots = getQuickAvailabilityChoices(quickChoice, days);
  const current = new Set(normalized);
  const isActive = quickSlots.length > 0 && quickSlots.every((slot) => current.has(slot));

  if (isActive) {
    for (const slot of quickSlots) {
      current.delete(slot);
    }
  } else {
    for (const slot of quickSlots) {
      current.add(slot);
    }
  }

  return normalizeAvailableChoices(Array.from(current));
}

export function normalizeAvailableChoices(choices: string[] | null | undefined): string[] {
  if (!Array.isArray(choices)) {
    return [];
  }

  const normalized = [];
  const seen = new Set<string>();

  for (const choice of choices) {
    const token = String(choice ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/-+/g, '_');

    const [rawDay, rawSession] = token.split('_');
    const dayKey = dayAliases.get(rawDay) ?? '';
    const sessionKey = sessionAliases.get(rawSession) ?? '';
    if (!dayKey || !sessionKey) {
      continue;
    }

    const canonical = `${dayKey}_${sessionKey}`;
    if (!seen.has(canonical)) {
      seen.add(canonical);
      normalized.push(canonical);
    }
  }

  return normalized.sort((left, right) => {
    const [leftDay, leftRow] = left.split('_');
    const [rightDay, rightRow] = right.split('_');
    const leftDayIndex = dayIndex.get(leftDay) ?? 99;
    const rightDayIndex = dayIndex.get(rightDay) ?? 99;
    if (leftDayIndex !== rightDayIndex) {
      return leftDayIndex - rightDayIndex;
    }
    const leftRowIndex = rowIndex.get(leftRow) ?? 99;
    const rightRowIndex = rowIndex.get(rightRow) ?? 99;
    return leftRowIndex - rightRowIndex;
  });
}

export function formatAvailabilityChoice(choice: string): string {
  const [dayKey, rowKey] = choice.split('_');
  const day = fallbackAvailabilityDays.find((item) => item.key === dayKey);
  const row = fallbackAvailabilityRows.find((item) => item.key === rowKey);

  if (!day || !row) {
    return choice;
  }

  return `${day.label} / ${row.label}`;
}

export function summarizeAvailableChoices(choices: string[]): string {
  const normalized = normalizeAvailableChoices(choices);
  if (normalized.length === 0) {
    return 'No recurring availability selected yet.';
  }

  if (normalized.length <= 4) {
    return normalized.map(formatAvailabilityChoice).join(', ');
  }

  const uniqueDays = new Set(normalized.map((choice) => choice.slice(0, 3)));
  return `${normalized.length} recurring slots across ${uniqueDays.size} day(s).`;
}

export function buildAvailabilityRows(
  selectedChoices: string[],
  days: AvailabilityGridDay[],
  rows: AvailabilityGridRow[]
) {
  const normalized = new Set(normalizeAvailableChoices(selectedChoices));

  return rows.map((row) => ({
    ...row,
    cells: days.map((day) => normalized.has(toAvailabilityChoice(day.key, row.key))),
  }));
}

export function computeWeekBarsFromChoices(choices: string[]) {
  const normalized = normalizeAvailableChoices(choices);
  const byDay = new Map<string, number>();

  for (const choice of normalized) {
    const dayKey = choice.slice(0, 3);
    byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + 1);
  }

  return fallbackAvailabilityDays.map((day) => {
    const count = byDay.get(day.key) ?? 0;
    return {
      key: day.key,
      day: day.label.charAt(0),
      height: count === 0 ? 24 : 28 + count * 18,
      active: count > 0,
      label: count > 0 ? `${count}` : null,
    };
  });
}

export function hasWeekendAvailability(choices: string[]): boolean {
  return normalizeAvailableChoices(choices).some((choice) => choice.startsWith('sat_') || choice.startsWith('sun_'));
}
