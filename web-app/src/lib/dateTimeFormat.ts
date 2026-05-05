export interface DateTimeLabelOptions {
  includeWeekday?: boolean;
}

function toValidDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function isSameCalendarDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatDate(date: Date, includeWeekday: boolean) {
  return date.toLocaleDateString(undefined, {
    weekday: includeWeekday ? 'short' : undefined,
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

function formatDateWithoutYear(date: Date, includeWeekday: boolean) {
  return date.toLocaleDateString(undefined, {
    weekday: includeWeekday ? 'short' : undefined,
    month: 'short',
    day: '2-digit',
  });
}

function formatTime(date: Date) {
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toPositiveWholeMinutes(start: Date, end: Date) {
  const minutes = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}

export function formatHumanDuration(startTime: string, endTime: string) {
  const start = toValidDate(startTime);
  const end = toValidDate(endTime);
  if (!start || !end) {
    return 'TBD';
  }

  const totalMinutes = toPositiveWholeMinutes(start, end);
  if (totalMinutes <= 0) {
    return 'TBD';
  }

  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days} day${days === 1 ? '' : 's'}`);
  }
  if (hours > 0) {
    parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  }
  if (minutes > 0) {
    parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  }

  return parts.join(' ');
}

export function formatDateAndTimeLabels(
  startTime: string,
  endTime: string,
  options: DateTimeLabelOptions = {}
) {
  const start = toValidDate(startTime);
  const end = toValidDate(endTime);
  if (!start || !end) {
    return { dateLabel: 'Date TBD', timeLabel: 'Time TBD', isMultiDay: false };
  }

  const includeWeekday = options.includeWeekday ?? true;

  if (isSameCalendarDate(start, end)) {
    return {
      dateLabel: formatDate(start, includeWeekday),
      timeLabel: `${formatTime(start)} - ${formatTime(end)}`,
      isMultiDay: false,
    };
  }

  return {
    dateLabel: `Start: ${formatDate(start, includeWeekday)}, ${formatTime(start)}`,
    timeLabel: `End: ${formatDate(end, includeWeekday)}, ${formatTime(end)}`,
    isMultiDay: true,
  };
}

export function formatTimelineRangeLabel(startTime: string, endTime: string) {
  const start = toValidDate(startTime);
  const end = toValidDate(endTime);
  if (!start || !end) {
    return 'Time TBD';
  }

  if (isSameCalendarDate(start, end)) {
    return `${formatDate(start, true)} · ${formatTime(start)} - ${formatTime(end)}`;
  }

  return `${formatDate(start, true)} ${formatTime(start)} - ${formatDate(end, true)} ${formatTime(end)}`;
}

export function formatDateTimePointLabel(value: string, options: DateTimeLabelOptions = {}) {
  const date = toValidDate(value);
  if (!date) {
    return 'Date TBD';
  }

  const includeWeekday = options.includeWeekday ?? true;
  return `${formatDate(date, includeWeekday)} · ${formatTime(date)}`;
}

export function formatActivityCardDateLabel(
  startTime: string,
  endTime: string,
  options: DateTimeLabelOptions = {}
) {
  const start = toValidDate(startTime);
  const end = toValidDate(endTime);
  if (!start || !end) {
    return 'Date TBD';
  }

  const includeWeekday = options.includeWeekday ?? true;
  if (isSameCalendarDate(start, end)) {
    return `${formatDate(start, includeWeekday)} · ${formatTime(start)}`;
  }

  if (start.getFullYear() !== end.getFullYear()) {
    return `${formatDateWithoutYear(start, includeWeekday)}, ${start.getFullYear()} - ${formatDateWithoutYear(end, includeWeekday)}, ${end.getFullYear()}`;
  }

  return `${formatDateWithoutYear(start, includeWeekday)} - ${formatDateWithoutYear(end, includeWeekday)}, ${end.getFullYear()}`;
}
