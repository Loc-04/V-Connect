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

export function safeText(value: unknown, fallback = ''): string {
  if (value == null) {
    return fallback;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  if (isPlainObject(value)) {
    return safeText(
      value.text ?? value.description ?? value.title ?? value.name,
      fallback
    );
  }

  return fallback;
}

function normalizeTimelineType(value: unknown): TimelineMilestoneType {
  const normalized = safeText(value, '').trim().toLowerCase();
  if (normalized === 'opening' || normalized === 'session' || normalized === 'break' || normalized === 'closing') {
    return normalized;
  }
  return 'other';
}

function normalizeTimelineStatus(value: unknown): TimelineMilestoneStatus {
  const normalized = safeText(value, '').trim().toLowerCase();
  if (normalized === 'in_progress' || normalized === 'completed' || normalized === 'cancelled') {
    return normalized;
  }
  return 'upcoming';
}

function normalizeIso(value: unknown): string {
  const candidate = safeText(value, '').trim();
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
  const numeric = typeof value === 'number' ? value : Number(safeText(value, ''));
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
}

function readDescriptionMeta(item: Record<string, unknown>) {
  const rawDescription = item.description;
  if (isPlainObject(rawDescription)) {
    return rawDescription;
  }
  if (typeof rawDescription === 'string') {
    const parsed = parseJsonSafely(rawDescription);
    if (isPlainObject(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function normalizeTimelineItem(item: unknown, activityId = '', fallbackIndex = 0): TimelineMilestone {
  const row = isPlainObject(item) ? item : {};
  const descriptionMeta = readDescriptionMeta(row) ?? {};
  const now = new Date().toISOString();

  const title = safeText(
    row.title ?? row.name ?? row.label ?? row.text,
    'Untitled milestone'
  ).trim() || 'Untitled milestone';
  const description = safeText(
    row.description ?? row.detail ?? row.notes ?? row.content,
    safeText(descriptionMeta.text ?? descriptionMeta.description, '')
  ).trim();

  const startTime = normalizeIso(
    row.startTime ?? row.start_time ?? row.timelineChoice ?? row.timeline_choice
  );
  const endTime = normalizeIso(
    row.endTime ?? row.end_time ?? descriptionMeta.endTime ?? descriptionMeta.end_time
  );

  return {
    id: safeText(row.id ?? row.milestoneId, `timeline-${fallbackIndex}`),
    activityId: safeText(row.activityId ?? row.activity_id, activityId),
    title,
    description,
    startTime,
    endTime,
    orderIndex: normalizeOrderIndex(
      row.orderIndex ?? row.order_index ?? descriptionMeta.orderIndex ?? descriptionMeta.order_index ?? fallbackIndex
    ),
    type: normalizeTimelineType(row.type ?? descriptionMeta.type),
    status: normalizeTimelineStatus(row.status ?? descriptionMeta.status),
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
