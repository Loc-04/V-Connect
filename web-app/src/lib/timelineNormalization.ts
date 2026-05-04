import type { TimelineMilestone, TimelineMilestoneStatus, TimelineMilestoneType } from '../types/timeline';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonSafely(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeTimelineLikeObject(value: Record<string, unknown>) {
  return (
    value.text ??
    value.description ??
    value.title ??
    value.name ??
    value.label ??
    null
  );
}

export function safeTimelineText(value: unknown, fallback = ''): string {
  if (value == null) {
    return fallback;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'string') {
    const parsed = parseJsonSafely(value);
    if (isPlainObject(parsed)) {
      return safeTimelineText(normalizeTimelineLikeObject(parsed), fallback);
    }
    return value;
  }

  if (isPlainObject(value)) {
    return safeTimelineText(
      normalizeTimelineLikeObject(value),
      fallback
    );
  }

  return fallback;
}

export function safeText(value: unknown, fallback = ''): string {
  return safeTimelineText(value, fallback);
}

function normalizeTimelineType(value: unknown): TimelineMilestoneType {
  const normalized = safeTimelineText(value, '').trim().toLowerCase();
  if (normalized === 'opening' || normalized === 'session' || normalized === 'break' || normalized === 'closing') {
    return normalized;
  }
  if (!normalized) {
    return 'session';
  }
  return 'other';
}

function normalizeTimelineStatus(value: unknown): TimelineMilestoneStatus {
  const normalized = safeTimelineText(value, '').trim().toLowerCase();
  if (normalized === 'in_progress' || normalized === 'completed' || normalized === 'cancelled') {
    return normalized;
  }
  return 'upcoming';
}

function normalizeIso(value: unknown): string {
  const candidate = safeTimelineText(value, '').trim();
  if (!candidate) {
    return '';
  }
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return parsed.toISOString();
}

function normalizeOrderIndex(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(safeTimelineText(value, ''));
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
}

function readTimelineMeta(value: unknown) {
  if (isPlainObject(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseJsonSafely(value);
    if (isPlainObject(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function normalizeTimelineItem(item: unknown, activityId = '', fallbackIndex = 0): TimelineMilestone {
  const row = isPlainObject(item) ? item : {};
  const descriptionSource = row.description ?? row.detail ?? row.notes ?? row.content ?? row.metadata ?? null;
  const nested = readTimelineMeta(descriptionSource) ?? {};
  const now = new Date().toISOString();

  const title = safeTimelineText(
    row.title ?? row.name ?? row.label ?? row.text,
    'Untitled milestone'
  ).trim() || 'Untitled milestone';
  const description = safeTimelineText(
    descriptionSource,
    ''
  ).trim();

  const startTime = normalizeIso(
    row.startTime ?? row.start_time ?? row.start ?? row.timelineChoice ?? row.timeline_choice ?? nested.startTime ?? nested.start_time
  );
  const endTime = normalizeIso(
    row.endTime ?? row.end_time ?? row.end ?? nested.endTime ?? nested.end_time
  );

  return {
    id: safeTimelineText(row.id ?? row.milestoneId, `timeline-${fallbackIndex}`),
    activityId: safeTimelineText(row.activityId ?? row.activity_id, activityId),
    title,
    description,
    startTime,
    endTime,
    orderIndex: normalizeOrderIndex(
      row.orderIndex ?? row.order_index ?? nested.orderIndex ?? nested.order_index ?? fallbackIndex
    ),
    type: normalizeTimelineType(row.type ?? nested.type),
    status: normalizeTimelineStatus(row.status ?? nested.status),
    createdAt: normalizeIso(row.createdAt ?? row.created_at) || now,
    updatedAt: normalizeIso(row.updatedAt ?? row.updated_at) || normalizeIso(row.createdAt ?? row.created_at) || now,
    source: 'server',
  };
}

function compareTimelineItem(left: TimelineMilestone, right: TimelineMilestone) {
  if (left.orderIndex !== right.orderIndex) {
    return left.orderIndex - right.orderIndex;
  }

  const leftTime = left.startTime ? new Date(left.startTime).getTime() : Number.MAX_SAFE_INTEGER;
  const rightTime = right.startTime ? new Date(right.startTime).getTime() : Number.MAX_SAFE_INTEGER;
  return leftTime - rightTime;
}

export function normalizeTimelineItems(input: unknown, activityId = ''): TimelineMilestone[] {
  let rows: unknown[] = [];

  if (Array.isArray(input)) {
    rows = input;
  } else if (isPlainObject(input) && Array.isArray(input.timeline)) {
    rows = input.timeline;
  } else if (typeof input === 'string') {
    const parsed = parseJsonSafely(input);
    rows = Array.isArray(parsed) ? parsed : [];
  }

  return rows
    .map((item, index) => normalizeTimelineItem(item, activityId, index))
    .sort(compareTimelineItem)
    .map((item, index) => ({
      ...item,
      orderIndex: index,
    }));
}
