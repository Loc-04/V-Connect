import { apiRequest } from './api';
import { supabase } from './supabase';
import { canTransitionTimelineStatus } from './timelineStatus';
import { sortTimelineByTime } from './timelineValidation';
import type {
  TimelineIntegrationMeta,
  TimelineMilestone,
  TimelineMilestoneDraft,
  TimelineMilestoneStatus,
  TimelineMilestoneType,
} from '../types/timeline';

const timelineStore = new Map<string, TimelineMilestone[]>();
const timelineSessionStorageKey = 'vconnect.timeline.session.v1';
let timelineStoreHydrated = false;

const serverIntegrationMeta: TimelineIntegrationMeta = {
  mode: 'server',
  pendingServerIntegration: false,
  message: 'Timeline is synchronized with backend.',
};

const localFallbackIntegrationMeta: TimelineIntegrationMeta = {
  mode: 'local_only',
  pendingServerIntegration: true,
  message: 'Timeline API is unavailable. Data is currently stored in frontend session only.',
};

type TimelineApiAvailability = 'unknown' | 'available' | 'unavailable';
let timelineApiAvailability: TimelineApiAvailability = 'unknown';
type TimelineTableAvailability = 'unknown' | 'available' | 'unavailable';
let timelineTableAvailability: TimelineTableAvailability = 'unknown';

interface TimelineServerRow {
  id?: string;
  activity_id?: string;
  activityId?: string;
  title?: string;
  description?: string | null;
  timeline_choice?: string;
  timelineChoice?: string;
  startTime?: string;
  start_time?: string;
  endTime?: string;
  end_time?: string;
  type?: string;
  status?: string;
  order_index?: number;
  orderIndex?: number;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
}

interface TimelineListResponse {
  timeline?: TimelineServerRow[];
  milestones?: TimelineServerRow[];
  rows?: TimelineServerRow[];
  data?: TimelineServerRow[];
}

interface TimelineMutationResponse {
  timeline?: TimelineServerRow[];
  milestones?: TimelineServerRow[];
  rows?: TimelineServerRow[];
  data?: TimelineServerRow[];
  milestone?: TimelineServerRow | null;
}

interface TimelineDescriptionEnvelope {
  text: string;
  endTime: string | null;
  type: TimelineMilestoneType;
  status: TimelineMilestoneStatus;
  orderIndex: number | null;
}

function cloneMilestone(item: TimelineMilestone): TimelineMilestone {
  return { ...item };
}

function canUseSessionStorage() {
  return typeof globalThis !== 'undefined' && typeof globalThis.sessionStorage !== 'undefined';
}

function hydrateTimelineStore() {
  if (timelineStoreHydrated) {
    return;
  }
  timelineStoreHydrated = true;

  if (!canUseSessionStorage()) {
    return;
  }

  try {
    const rawPayload = globalThis.sessionStorage.getItem(timelineSessionStorageKey);
    if (!rawPayload) {
      return;
    }

    const parsed = JSON.parse(rawPayload) as Record<string, TimelineMilestone[]>;
    for (const [activityId, rows] of Object.entries(parsed)) {
      if (!Array.isArray(rows)) {
        continue;
      }
      timelineStore.set(activityId, normalizeTimeline(activityId, rows));
    }
  } catch {
    // Ignore invalid session payload and keep runtime map only.
  }
}

function persistTimelineStore() {
  if (!canUseSessionStorage()) {
    return;
  }

  try {
    const payload: Record<string, TimelineMilestone[]> = {};
    for (const [activityId, rows] of timelineStore.entries()) {
      payload[activityId] = normalizeTimeline(activityId, rows);
    }
    globalThis.sessionStorage.setItem(timelineSessionStorageKey, JSON.stringify(payload));
  } catch {
    // Ignore storage quota/runtime errors and keep runtime map only.
  }
}

function createTimelineId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `timeline-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function asIso(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function ensureValidRange(startTime: string, endTime?: string | null) {
  const startDate = new Date(startTime);
  const parsedEnd = asIso(endTime ?? null);
  if (!parsedEnd) {
    const fallbackEnd = new Date(startDate.getTime() + 30 * 60_000);
    return fallbackEnd.toISOString();
  }

  const endDate = new Date(parsedEnd);
  if (endDate <= startDate) {
    const fallbackEnd = new Date(startDate.getTime() + 30 * 60_000);
    return fallbackEnd.toISOString();
  }

  return parsedEnd;
}

function isTimelineType(value: unknown): value is TimelineMilestoneType {
  return (
    value === 'check_in' ||
    value === 'opening' ||
    value === 'session' ||
    value === 'break' ||
    value === 'closing' ||
    value === 'wrap_up' ||
    value === 'custom'
  );
}

function isTimelineStatus(value: unknown): value is TimelineMilestoneStatus {
  return (
    value === 'upcoming' ||
    value === 'in_progress' ||
    value === 'completed' ||
    value === 'delayed' ||
    value === 'cancelled'
  );
}

function parseDescriptionEnvelope(rawDescription: string | null | undefined): TimelineDescriptionEnvelope {
  const fallback: TimelineDescriptionEnvelope = {
    text: typeof rawDescription === 'string' ? rawDescription.trim() : '',
    endTime: null,
    type: 'custom',
    status: 'upcoming',
    orderIndex: null,
  };

  if (!rawDescription) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(rawDescription);
    if (!parsed || typeof parsed !== 'object') {
      return fallback;
    }

    const text = typeof (parsed as { text?: unknown }).text === 'string'
      ? (parsed as { text: string }).text.trim()
      : fallback.text;
    const endTime = asIso(typeof (parsed as { endTime?: unknown }).endTime === 'string' ? (parsed as { endTime: string }).endTime : null);
    const type = isTimelineType((parsed as { type?: unknown }).type) ? (parsed as { type: TimelineMilestoneType }).type : fallback.type;
    const status = isTimelineStatus((parsed as { status?: unknown }).status)
      ? (parsed as { status: TimelineMilestoneStatus }).status
      : fallback.status;
    const orderIndex = typeof (parsed as { orderIndex?: unknown }).orderIndex === 'number'
      ? (parsed as { orderIndex: number }).orderIndex
      : null;

    return {
      text,
      endTime,
      type,
      status,
      orderIndex,
    };
  } catch {
    return fallback;
  }
}

function stringifyDescriptionEnvelope(draft: TimelineMilestoneDraft) {
  const envelope: TimelineDescriptionEnvelope = {
    text: draft.description.trim(),
    endTime: asIso(draft.endTime),
    type: draft.type,
    status: draft.status ?? 'upcoming',
    orderIndex: typeof draft.orderIndex === 'number' ? draft.orderIndex : null,
  };
  return JSON.stringify(envelope);
}

function normalizeMilestone(activityId: string, draft: TimelineMilestoneDraft, orderIndex: number): TimelineMilestone {
  const now = new Date().toISOString();
  return {
    id: draft.id ?? createTimelineId(),
    activityId,
    title: draft.title.trim(),
    description: draft.description.trim(),
    startTime: draft.startTime,
    endTime: draft.endTime,
    orderIndex,
    type: draft.type,
    status: draft.status ?? 'upcoming',
    createdAt: now,
    updatedAt: now,
    source: 'local_only',
  };
}

function normalizeTimeline(activityId: string, rows: Array<TimelineMilestone | TimelineMilestoneDraft>) {
  const normalized = rows.map((row, index) => {
    if ('activityId' in row) {
      return {
        ...row,
        activityId,
      };
    }
    const preferredOrderIndex =
      typeof row.orderIndex === 'number' && Number.isFinite(row.orderIndex)
        ? row.orderIndex
        : index;
    return normalizeMilestone(activityId, row, preferredOrderIndex);
  });

  const sorted = sortTimelineByTime(normalized);
  return sorted.map((item, index) => ({
    ...item,
    orderIndex: index,
  }));
}

function writeTimeline(activityId: string, rows: TimelineMilestone[]) {
  hydrateTimelineStore();
  timelineStore.set(activityId, normalizeTimeline(activityId, rows));
  persistTimelineStore();
}

function readTimeline(activityId: string): TimelineMilestone[] {
  hydrateTimelineStore();
  const rows = timelineStore.get(activityId) ?? [];
  return normalizeTimeline(activityId, rows).map(cloneMilestone);
}

function extractRows(payload: TimelineServerRow[] | TimelineListResponse | TimelineMutationResponse): TimelineServerRow[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload.timeline)) {
    return payload.timeline;
  }

  if (Array.isArray(payload.milestones)) {
    return payload.milestones;
  }

  if (Array.isArray(payload.rows)) {
    return payload.rows;
  }

  if (Array.isArray(payload.data)) {
    return payload.data;
  }

  if ('milestone' in payload && payload.milestone) {
    return [payload.milestone];
  }

  return [];
}

function mapServerRowToMilestone(activityId: string, row: TimelineServerRow, orderIndex: number): TimelineMilestone {
  const now = new Date().toISOString();
  const descriptionEnvelope = parseDescriptionEnvelope(row.description ?? null);
  const startTime =
    asIso(row.timeline_choice) ??
    asIso(row.timelineChoice) ??
    asIso(row.start_time) ??
    asIso(row.startTime) ??
    now;
  const endTime = ensureValidRange(startTime, row.end_time ?? row.endTime ?? descriptionEnvelope.endTime ?? null);

  return {
    id: row.id ?? createTimelineId(),
    activityId,
    title: String(row.title ?? '').trim(),
    description: descriptionEnvelope.text,
    startTime,
    endTime,
    orderIndex:
      typeof row.order_index === 'number'
        ? row.order_index
        : typeof row.orderIndex === 'number'
          ? row.orderIndex
          : descriptionEnvelope.orderIndex ?? orderIndex,
    type: isTimelineType(row.type) ? row.type : descriptionEnvelope.type,
    status: isTimelineStatus(row.status) ? row.status : descriptionEnvelope.status,
    createdAt: asIso(row.created_at ?? row.createdAt ?? null) ?? now,
    updatedAt: asIso(row.updated_at ?? row.updatedAt ?? row.created_at ?? row.createdAt ?? null) ?? now,
    source: 'server',
  };
}

function toServerPayload(draft: TimelineMilestoneDraft) {
  const timelineChoice = asIso(draft.startTime) ?? asIso(draft.endTime) ?? new Date().toISOString();
  return {
    title: draft.title.trim(),
    description: stringifyDescriptionEnvelope({
      ...draft,
      startTime: timelineChoice,
    }),
    timelineChoice,
    timeline_choice: timelineChoice,
  };
}

function toSupabasePayload(activityId: string, draft: TimelineMilestoneDraft) {
  const timelineChoice = asIso(draft.startTime) ?? asIso(draft.endTime) ?? new Date().toISOString();
  return {
    activity_id: activityId,
    title: draft.title.trim(),
    description: stringifyDescriptionEnvelope({
      ...draft,
      startTime: timelineChoice,
    }),
    timeline_choice: timelineChoice,
  };
}

function toTimelineDraft(milestone: TimelineMilestone): TimelineMilestoneDraft {
  return {
    id: milestone.id,
    title: milestone.title,
    description: milestone.description,
    startTime: milestone.startTime,
    endTime: milestone.endTime,
    type: milestone.type,
    status: milestone.status,
    orderIndex: milestone.orderIndex,
  };
}

function shouldUseLocalFallback(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('route not found') ||
    message.includes('request failed (404)') ||
    message.includes('request failed (405)') ||
    message.includes('request failed (501)') ||
    message.includes('cannot get') ||
    message.includes('cannot post') ||
    message.includes('cannot patch') ||
    message.includes('cannot delete')
  );
}

function shouldUseSupabaseTableFallback(error: unknown) {
  if (!(error instanceof Error)) {
    return true;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('relation') ||
    message.includes('permission') ||
    message.includes('policy') ||
    message.includes('rls') ||
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('not found') ||
    message.includes('does not exist') ||
    message.includes('failed to fetch') ||
    message.includes('network')
  );
}

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function listServerTimeline(activityId: string, accessToken: string): Promise<TimelineMilestone[]> {
  const response = await apiRequest<TimelineServerRow[] | TimelineListResponse>(`/activities/${activityId}/timeline`, {
    accessToken,
  });
  const rows = extractRows(response);
  const milestones = sortTimelineByTime(rows.map((row, index) => mapServerRowToMilestone(activityId, row, index)));
  return milestones.map((item, index) => ({
    ...item,
    orderIndex: index,
  }));
}

async function createServerMilestone(activityId: string, draft: TimelineMilestoneDraft, accessToken: string) {
  await apiRequest<TimelineMutationResponse>(`/activities/${activityId}/timeline`, {
    method: 'POST',
    accessToken,
    body: toServerPayload(draft),
  });
}

async function updateServerMilestone(activityId: string, milestoneId: string, draft: TimelineMilestoneDraft, accessToken: string) {
  await apiRequest<TimelineMutationResponse>(`/activities/${activityId}/timeline/${milestoneId}`, {
    method: 'PATCH',
    accessToken,
    body: toServerPayload(draft),
  });
}

async function deleteServerMilestone(activityId: string, milestoneId: string, accessToken: string) {
  await apiRequest(`/activities/${activityId}/timeline/${milestoneId}`, {
    method: 'DELETE',
    accessToken,
  });
}

async function listTimelineRowsFromTable(activityId: string): Promise<TimelineServerRow[]> {
  const { data, error } = await supabase
    .from('activities_timeline')
    .select('id, activity_id, title, description, timeline_choice, created_at')
    .eq('activity_id', activityId)
    .order('timeline_choice', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as TimelineServerRow[];
}

async function listTableTimeline(activityId: string): Promise<TimelineMilestone[]> {
  const rows = await listTimelineRowsFromTable(activityId);
  const milestones = sortTimelineByTime(rows.map((row, index) => mapServerRowToMilestone(activityId, row, index)));
  return milestones.map((item, index) => ({
    ...item,
    orderIndex: index,
  }));
}

async function createTableMilestone(activityId: string, draft: TimelineMilestoneDraft) {
  const { error } = await supabase.from('activities_timeline').insert([toSupabasePayload(activityId, draft)]);
  if (error) {
    throw new Error(error.message);
  }
}

async function updateTableMilestone(activityId: string, milestoneId: string, draft: TimelineMilestoneDraft) {
  const payload = toSupabasePayload(activityId, draft);
  const { error } = await supabase
    .from('activities_timeline')
    .update({
      title: payload.title,
      description: payload.description,
      timeline_choice: payload.timeline_choice,
    })
    .eq('id', milestoneId)
    .eq('activity_id', activityId);

  if (error) {
    throw new Error(error.message);
  }
}

async function deleteTableMilestone(activityId: string, milestoneId: string) {
  const { error } = await supabase
    .from('activities_timeline')
    .delete()
    .eq('id', milestoneId)
    .eq('activity_id', activityId);
  if (error) {
    throw new Error(error.message);
  }
}

async function replaceTableTimeline(activityId: string, drafts: TimelineMilestoneDraft[]) {
  const { error: deleteError } = await supabase
    .from('activities_timeline')
    .delete()
    .eq('activity_id', activityId);
  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (drafts.length > 0) {
    const payloads = drafts.map((draft) => toSupabasePayload(activityId, draft));
    const { error: insertError } = await supabase.from('activities_timeline').insert(payloads);
    if (insertError) {
      throw new Error(insertError.message);
    }
  }
}

export function supportsTimelineServerIntegration() {
  return true;
}

export function getTimelineIntegrationMeta(): TimelineIntegrationMeta {
  return { ...serverIntegrationMeta };
}

export async function listActivityTimeline(activityId: string): Promise<{
  milestones: TimelineMilestone[];
  integration: TimelineIntegrationMeta;
}> {
  const cachedMilestones = readTimeline(activityId);
  const accessToken = await getAccessToken();
  const shouldTryServer = timelineApiAvailability !== 'unavailable' && Boolean(accessToken);
  if (shouldTryServer && accessToken) {
    try {
      const milestones = await listServerTimeline(activityId, accessToken);
      if (milestones.length === 0 && cachedMilestones.length > 0) {
        return {
          milestones: cachedMilestones,
          integration: {
            ...localFallbackIntegrationMeta,
            message: 'Backend timeline is empty. Showing milestones from current browser session.',
          },
        };
      }
      writeTimeline(activityId, milestones);
      timelineApiAvailability = 'available';
      return {
        milestones,
        integration: { ...serverIntegrationMeta },
      };
    } catch (error) {
      if (!shouldUseLocalFallback(error)) {
        throw error;
      }
      timelineApiAvailability = 'unavailable';
    }
  }

  if (timelineTableAvailability !== 'unavailable') {
    try {
      const milestones = await listTableTimeline(activityId);
      if (milestones.length === 0 && cachedMilestones.length > 0) {
        return {
          milestones: cachedMilestones,
          integration: {
            ...localFallbackIntegrationMeta,
            message: 'Timeline table has no rows yet. Showing milestones from current browser session.',
          },
        };
      }
      writeTimeline(activityId, milestones);
      timelineTableAvailability = 'available';
      return {
        milestones,
        integration: { ...serverIntegrationMeta },
      };
    } catch (error) {
      if (!shouldUseSupabaseTableFallback(error)) {
        throw error;
      }
      timelineTableAvailability = 'unavailable';
    }
  }

  return {
    milestones: readTimeline(activityId),
    integration: { ...localFallbackIntegrationMeta },
  };
}

export async function replaceActivityTimeline(
  activityId: string,
  drafts: TimelineMilestoneDraft[]
): Promise<{
  milestones: TimelineMilestone[];
  integration: TimelineIntegrationMeta;
}> {
  const next = normalizeTimeline(activityId, drafts);
  writeTimeline(activityId, next);

  const accessToken = await getAccessToken();
  const shouldTryServer = timelineApiAvailability !== 'unavailable' && Boolean(accessToken);
  if (shouldTryServer && accessToken) {
    try {
      const existing = await listServerTimeline(activityId, accessToken);
      await Promise.all(
        existing
          .map((milestone) => milestone.id)
          .filter(Boolean)
          .map((milestoneId) => deleteServerMilestone(activityId, milestoneId, accessToken))
      );

      for (const draft of drafts) {
        await createServerMilestone(activityId, draft, accessToken);
      }

      const refreshed = await listServerTimeline(activityId, accessToken);
      writeTimeline(activityId, refreshed);
      timelineApiAvailability = 'available';
      return {
        milestones: refreshed,
        integration: { ...serverIntegrationMeta },
      };
    } catch (error) {
      if (!shouldUseLocalFallback(error)) {
        throw error;
      }
      timelineApiAvailability = 'unavailable';
    }
  }

  if (timelineTableAvailability !== 'unavailable') {
    try {
      await replaceTableTimeline(activityId, drafts);
      const refreshed = await listTableTimeline(activityId);
      writeTimeline(activityId, refreshed);
      timelineTableAvailability = 'available';
      return {
        milestones: refreshed,
        integration: { ...serverIntegrationMeta },
      };
    } catch (error) {
      if (!shouldUseSupabaseTableFallback(error)) {
        throw error;
      }
      timelineTableAvailability = 'unavailable';
    }
  }

  return {
    milestones: readTimeline(activityId),
    integration: { ...localFallbackIntegrationMeta },
  };
}

export async function appendActivityTimeline(
  activityId: string,
  drafts: TimelineMilestoneDraft[]
): Promise<{
  milestones: TimelineMilestone[];
  integration: TimelineIntegrationMeta;
}> {
  const current = readTimeline(activityId);
  const seeded = drafts.map((draft, index) => normalizeMilestone(activityId, draft, current.length + index));
  const merged = normalizeTimeline(activityId, [...current, ...seeded]);
  return replaceActivityTimeline(activityId, merged.map(toTimelineDraft));
}

export async function createTimelineMilestone(
  activityId: string,
  draft: TimelineMilestoneDraft
): Promise<{
  milestone: TimelineMilestone;
  milestones: TimelineMilestone[];
  integration: TimelineIntegrationMeta;
}> {
  const current = readTimeline(activityId);
  const milestone = normalizeMilestone(activityId, draft, current.length);
  writeTimeline(activityId, [...current, milestone]);

  const accessToken = await getAccessToken();
  const shouldTryServer = timelineApiAvailability !== 'unavailable' && Boolean(accessToken);
  if (shouldTryServer && accessToken) {
    try {
      await createServerMilestone(activityId, draft, accessToken);
      const refreshed = await listServerTimeline(activityId, accessToken);
      writeTimeline(activityId, refreshed);
      timelineApiAvailability = 'available';
      return {
        milestone: refreshed.find((item) => item.title === milestone.title && item.startTime === milestone.startTime) ?? milestone,
        milestones: refreshed,
        integration: { ...serverIntegrationMeta },
      };
    } catch (error) {
      if (!shouldUseLocalFallback(error)) {
        throw error;
      }
      timelineApiAvailability = 'unavailable';
    }
  }

  if (timelineTableAvailability !== 'unavailable') {
    try {
      await createTableMilestone(activityId, draft);
      const refreshed = await listTableTimeline(activityId);
      writeTimeline(activityId, refreshed);
      timelineTableAvailability = 'available';
      return {
        milestone: refreshed.find((item) => item.title === milestone.title && item.startTime === milestone.startTime) ?? milestone,
        milestones: refreshed,
        integration: { ...serverIntegrationMeta },
      };
    } catch (error) {
      if (!shouldUseSupabaseTableFallback(error)) {
        throw error;
      }
      timelineTableAvailability = 'unavailable';
    }
  }

  return {
    milestone,
    milestones: readTimeline(activityId),
    integration: { ...localFallbackIntegrationMeta },
  };
}

export async function updateTimelineMilestone(
  activityId: string,
  milestoneId: string,
  draft: TimelineMilestoneDraft
): Promise<{
  milestone: TimelineMilestone | null;
  milestones: TimelineMilestone[];
  integration: TimelineIntegrationMeta;
}> {
  const current = readTimeline(activityId);
  const now = new Date().toISOString();
  let updatedMilestone: TimelineMilestone | null = null;
  const updated = current.map((item) => {
    if (item.id !== milestoneId) {
      return item;
    }

    const nextStatus = draft.status ?? item.status;
    if (!canTransitionTimelineStatus(item.status, nextStatus)) {
      throw new Error(`Invalid status transition: ${item.status} -> ${nextStatus}.`);
    }

    updatedMilestone = {
      ...item,
      title: draft.title.trim(),
      description: draft.description.trim(),
      startTime: draft.startTime,
      endTime: draft.endTime,
      type: draft.type,
      status: nextStatus,
      updatedAt: now,
    };

    return updatedMilestone;
  });

  writeTimeline(activityId, updated);

  const accessToken = await getAccessToken();
  const shouldTryServer = timelineApiAvailability !== 'unavailable' && Boolean(accessToken);
  if (shouldTryServer && accessToken && updatedMilestone) {
    try {
      await updateServerMilestone(activityId, milestoneId, draft, accessToken);
      const refreshed = await listServerTimeline(activityId, accessToken);
      writeTimeline(activityId, refreshed);
      timelineApiAvailability = 'available';
      return {
        milestone: refreshed.find((item) => item.id === milestoneId) ?? updatedMilestone,
        milestones: refreshed,
        integration: { ...serverIntegrationMeta },
      };
    } catch (error) {
      if (!shouldUseLocalFallback(error)) {
        throw error;
      }
      timelineApiAvailability = 'unavailable';
    }
  }

  if (timelineTableAvailability !== 'unavailable' && updatedMilestone) {
    try {
      await updateTableMilestone(activityId, milestoneId, draft);
      const refreshed = await listTableTimeline(activityId);
      writeTimeline(activityId, refreshed);
      timelineTableAvailability = 'available';
      return {
        milestone: refreshed.find((item) => item.id === milestoneId) ?? updatedMilestone,
        milestones: refreshed,
        integration: { ...serverIntegrationMeta },
      };
    } catch (error) {
      if (!shouldUseSupabaseTableFallback(error)) {
        throw error;
      }
      timelineTableAvailability = 'unavailable';
    }
  }

  return {
    milestone: updatedMilestone,
    milestones: readTimeline(activityId),
    integration: { ...localFallbackIntegrationMeta },
  };
}

export async function updateTimelineMilestoneStatus(
  activityId: string,
  milestoneId: string,
  status: TimelineMilestoneStatus
): Promise<{
  milestone: TimelineMilestone | null;
  milestones: TimelineMilestone[];
  integration: TimelineIntegrationMeta;
}> {
  const current = readTimeline(activityId);
  const existingMilestone = current.find((item) => item.id === milestoneId) ?? null;
  if (!existingMilestone) {
    return {
      milestone: null,
      milestones: current,
      integration: { ...localFallbackIntegrationMeta },
    };
  }

  return updateTimelineMilestone(activityId, milestoneId, {
    ...toTimelineDraft(existingMilestone),
    status,
  });
}

export async function deleteTimelineMilestone(
  activityId: string,
  milestoneId: string
): Promise<{
  milestones: TimelineMilestone[];
  integration: TimelineIntegrationMeta;
}> {
  const current = readTimeline(activityId);
  const filtered = current.filter((item) => item.id !== milestoneId);
  writeTimeline(activityId, filtered);

  const accessToken = await getAccessToken();
  const shouldTryServer = timelineApiAvailability !== 'unavailable' && Boolean(accessToken);
  if (shouldTryServer && accessToken) {
    try {
      await deleteServerMilestone(activityId, milestoneId, accessToken);
      const refreshed = await listServerTimeline(activityId, accessToken);
      writeTimeline(activityId, refreshed);
      timelineApiAvailability = 'available';
      return {
        milestones: refreshed,
        integration: { ...serverIntegrationMeta },
      };
    } catch (error) {
      if (!shouldUseLocalFallback(error)) {
        throw error;
      }
      timelineApiAvailability = 'unavailable';
    }
  }

  if (timelineTableAvailability !== 'unavailable') {
    try {
      await deleteTableMilestone(activityId, milestoneId);
      const refreshed = await listTableTimeline(activityId);
      writeTimeline(activityId, refreshed);
      timelineTableAvailability = 'available';
      return {
        milestones: refreshed,
        integration: { ...serverIntegrationMeta },
      };
    } catch (error) {
      if (!shouldUseSupabaseTableFallback(error)) {
        throw error;
      }
      timelineTableAvailability = 'unavailable';
    }
  }

  return {
    milestones: readTimeline(activityId),
    integration: { ...localFallbackIntegrationMeta },
  };
}

export async function moveTimelineMilestone(
  activityId: string,
  milestoneId: string,
  direction: 'up' | 'down'
): Promise<{
  milestones: TimelineMilestone[];
  integration: TimelineIntegrationMeta;
}> {
  const current = readTimeline(activityId);
  const currentIndex = current.findIndex((item) => item.id === milestoneId);
  if (currentIndex < 0) {
    return {
      milestones: current,
      integration: { ...serverIntegrationMeta },
    };
  }

  const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (swapIndex < 0 || swapIndex >= current.length) {
    return {
      milestones: current,
      integration: { ...serverIntegrationMeta },
    };
  }

  const next = [...current];
  const temp = next[currentIndex];
  next[currentIndex] = next[swapIndex];
  next[swapIndex] = temp;
  const reorderedDrafts = next.map((item, index) => ({
    ...toTimelineDraft(item),
    orderIndex: index,
  }));
  return replaceActivityTimeline(activityId, reorderedDrafts);
}
