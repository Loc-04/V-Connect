import { isPlainObject } from './validators.js';

const availabilityDays = [
  { key: 'mon', label: 'Mon', fullLabel: 'Monday' },
  { key: 'tue', label: 'Tue', fullLabel: 'Tuesday' },
  { key: 'wed', label: 'Wed', fullLabel: 'Wednesday' },
  { key: 'thu', label: 'Thu', fullLabel: 'Thursday' },
  { key: 'fri', label: 'Fri', fullLabel: 'Friday' },
  { key: 'sat', label: 'Sat', fullLabel: 'Saturday' },
  { key: 'sun', label: 'Sun', fullLabel: 'Sunday' },
];

const availabilityRows = [
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
  ['thur', 'thu'],
  ['thurs', 'thu'],
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
  ['morn', 'mor'],
  ['morning', 'mor'],
  ['aft', 'aft'],
  ['afternoon', 'aft'],
  ['eve', 'eve'],
  ['evening', 'eve'],
  ['night', 'eve'],
]);

const dayIndexByKey = new Map(availabilityDays.map((day, index) => [day.key, index]));
const rowIndexByKey = new Map(availabilityRows.map((row, index) => [row.key, index]));

function toChoiceKey(dayKey, sessionKey) {
  return `${dayKey}_${sessionKey}`;
}

function normalizeChoiceToken(rawChoice) {
  const normalized = String(rawChoice ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_');

  if (!normalized) {
    return '';
  }

  const [rawDay, rawSession] = normalized.split('_');
  if (!rawDay || !rawSession) {
    return '';
  }

  const dayKey = dayAliases.get(rawDay) ?? '';
  const sessionKey = sessionAliases.get(rawSession) ?? '';
  if (!dayKey || !sessionKey) {
    return '';
  }

  return toChoiceKey(dayKey, sessionKey);
}

function sortAvailableChoices(choices) {
  return [...choices].sort((left, right) => {
    const [leftDay, leftSession] = left.split('_');
    const [rightDay, rightSession] = right.split('_');
    const leftDayIndex = dayIndexByKey.get(leftDay) ?? 99;
    const rightDayIndex = dayIndexByKey.get(rightDay) ?? 99;

    if (leftDayIndex !== rightDayIndex) {
      return leftDayIndex - rightDayIndex;
    }

    const leftRowIndex = rowIndexByKey.get(leftSession) ?? 99;
    const rightRowIndex = rowIndexByKey.get(rightSession) ?? 99;
    return leftRowIndex - rightRowIndex;
  });
}

function normalizeAvailableChoicesInput(value, fieldName = 'availableChoices') {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array of strings.`);
  }

  const seen = new Set();
  const choices = [];

  for (const entry of value) {
    const normalizedChoice = normalizeChoiceToken(entry);
    if (!normalizedChoice) {
      throw new Error(`${fieldName} contains an invalid slot value.`);
    }
    if (!seen.has(normalizedChoice)) {
      seen.add(normalizedChoice);
      choices.push(normalizedChoice);
    }
  }

  return sortAvailableChoices(choices);
}

function expandLegacyAvailability(value) {
  if (!isPlainObject(value)) {
    throw new Error('availability must be an object.');
  }

  const weekdays = Boolean(value.weekdays);
  const weekends = Boolean(value.weekends);
  const evenings = Boolean(value.evenings);

  const choices = [];

  if (weekdays) {
    for (const day of ['mon', 'tue', 'wed', 'thu', 'fri']) {
      choices.push(toChoiceKey(day, 'mor'), toChoiceKey(day, 'aft'));
    }
  }

  if (weekends) {
    for (const day of ['sat', 'sun']) {
      choices.push(toChoiceKey(day, 'mor'), toChoiceKey(day, 'aft'));
    }
  }

  if (evenings) {
    for (const day of availabilityDays.map((item) => item.key)) {
      choices.push(toChoiceKey(day, 'eve'));
    }
  }

  return sortAvailableChoices(Array.from(new Set(choices)));
}

function getAvailableChoices(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  try {
    return normalizeAvailableChoicesInput(value);
  } catch {
    return [];
  }
}

function serializeVolunteerProfile(volunteerProfile) {
  if (!volunteerProfile) {
    return null;
  }

  return {
    user_id: volunteerProfile.user_id,
    skills: Array.isArray(volunteerProfile.skills) ? volunteerProfile.skills : [],
    interests: Array.isArray(volunteerProfile.interests) ? volunteerProfile.interests : [],
    availableChoices: getAvailableChoices(volunteerProfile.available_choices),
    total_hours: Number(volunteerProfile.total_hours ?? 0),
    updated_at: volunteerProfile.updated_at ?? null,
  };
}

function buildAvailabilitySlotsPayload() {
  return {
    availabilitySlots: availabilityDays.flatMap((day) =>
      availabilityRows.map((row) => ({
        key: toChoiceKey(day.key, row.key),
        label: `${day.label} / ${row.label}`,
        description: `${day.fullLabel} ${row.fullLabel}`,
        dayKey: day.key,
        dayLabel: day.label,
        sessionKey: row.key,
        sessionLabel: row.label,
      }))
    ),
    availabilityGrid: {
      days: availabilityDays,
      rows: availabilityRows,
    },
  };
}

function slotLabel(choice) {
  const normalized = normalizeChoiceToken(choice);
  if (!normalized) {
    return '';
  }

  const [dayKey, sessionKey] = normalized.split('_');
  const day = availabilityDays.find((item) => item.key === dayKey);
  const row = availabilityRows.find((item) => item.key === sessionKey);
  if (!day || !row) {
    return normalized;
  }

  return `${day.label} / ${row.label}`;
}

function buildAvailableChoicesSummary(choices) {
  const normalizedChoices = getAvailableChoices(choices);
  if (normalizedChoices.length === 0) {
    return 'No recurring availability set.';
  }

  if (normalizedChoices.length <= 4) {
    return normalizedChoices.map(slotLabel).join(', ');
  }

  const uniqueDays = new Set(normalizedChoices.map((choice) => choice.split('_')[0]));
  return `${normalizedChoices.length} recurring slots across ${uniqueDays.size} day(s).`;
}

function getActivitySlotChoices(startTime, endTime) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return [];
  }

  const dayTokens = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const dayKey = dayTokens[start.getDay()] ?? '';
  if (!dayKey) {
    return [];
  }

  const sessions = [];
  const startHour = start.getHours() + start.getMinutes() / 60;
  const endHour = end.getHours() + end.getMinutes() / 60;

  const windows = [
    { key: 'mor', startHour: 6, endHour: 12 },
    { key: 'aft', startHour: 12, endHour: 17 },
    { key: 'eve', startHour: 17, endHour: 24 },
  ];

  for (const window of windows) {
    const overlaps = startHour < window.endHour && endHour > window.startHour;
    if (overlaps) {
      sessions.push(toChoiceKey(dayKey, window.key));
    }
  }

  return sortAvailableChoices(sessions);
}

function computeAvailabilityMatch(choices, startTime, endTime) {
  const normalizedChoices = getAvailableChoices(choices);
  const activityChoices = getActivitySlotChoices(startTime, endTime);

  if (normalizedChoices.length === 0 || activityChoices.length === 0) {
    return { score: 0, reasons: [] };
  }

  const choiceSet = new Set(normalizedChoices);
  const matchedChoices = activityChoices.filter((choice) => choiceSet.has(choice));
  if (matchedChoices.length === 0) {
    return { score: 0, reasons: [] };
  }

  const score = Math.min(15, Math.round((matchedChoices.length / activityChoices.length) * 15));
  const labels = matchedChoices.map(slotLabel).slice(0, 2);

  return {
    score,
    reasons: [`Availability match: ${labels.join(', ')}`],
  };
}

export {
  availabilityDays,
  availabilityRows,
  buildAvailabilitySlotsPayload,
  buildAvailableChoicesSummary,
  computeAvailabilityMatch,
  expandLegacyAvailability,
  getAvailableChoices,
  normalizeAvailableChoicesInput,
  serializeVolunteerProfile,
  slotLabel,
  toChoiceKey,
};
