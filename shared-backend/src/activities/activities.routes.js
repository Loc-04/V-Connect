import { Router } from 'express';
import { activityColumns, validActivityStatuses } from '../config/constants.js';
import { supabaseAdmin } from '../database/supabase.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { buildFormattedAddress, resolveProvinceAndWard } from '../locations/locations.service.js';
import { createNotificationRecord } from '../notifications/notifications.service.js';
import { normalizeActivityPayload } from './activities.validation.js';
import {
  mapActivitiesWithResolvedCoverImage,
  resolveActivityCoverImageUrl,
  withResolvedActivityCoverImage,
} from './activities.cover.js';
import {
  canWriteActivities,
  getActivityById,
  listPublishedActivitiesForGuest,
  getPublishedActivityForGuestById,
  getOrganizerPublicProfilesByIds,
  getActiveParticipationCountsByActivityIds,
} from './activities.service.js';

const router = Router();

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const timelineColumns = 'id, activity_id, title, description, timeline_choice, created_at';

function parseDateBoundary(rawValue, boundary) {
  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    return null;
  }

  const value = rawValue.trim();
  if (dateOnlyPattern.test(value)) {
    const suffix = boundary === 'end' ? 'T23:59:59.999Z' : 'T00:00:00.000Z';
    const date = new Date(`${value}${suffix}`);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function parseDateOnlyRange(rawValue) {
  if (typeof rawValue !== 'string' || !dateOnlyPattern.test(rawValue.trim())) {
    return null;
  }

  const normalized = rawValue.trim();
  const start = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) {
    return null;
  }

  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function normalizeSkillFilters(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue
      .map((item) => String(item).trim().toLowerCase())
      .filter((item) => item.length > 0);
  }

  if (typeof rawValue !== 'string') {
    return [];
  }

  return rawValue
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
}

function getLocationText(location) {
  if (!location) {
    return '';
  }

  if (typeof location === 'string') {
    return location.toLowerCase();
  }

  if (typeof location !== 'object') {
    return '';
  }

  const parts = [
    typeof location.address === 'string' ? location.address : '',
    typeof location.formattedAddress === 'string' ? location.formattedAddress : '',
    typeof location.city === 'string' ? location.city : '',
    typeof location.ward === 'string' ? location.ward : '',
    typeof location.district === 'string' ? location.district : '',
    typeof location.province === 'string' ? location.province : '',
  ];

  return parts.join(' ').toLowerCase();
}

function normalizeCoordinateValue(value) {
  if (value == null || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeOptionalText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function matchesSkillFilter(activity, skillFilters) {
  if (skillFilters.length === 0) {
    return true;
  }

  const requiredSkills = Array.isArray(activity.required_skills) ? activity.required_skills : [];
  const normalizedSkills = requiredSkills.map((skill) => String(skill).trim().toLowerCase()).filter(Boolean);
  if (normalizedSkills.length === 0) {
    return false;
  }

  return skillFilters.some((filterSkill) =>
    normalizedSkills.some((skill) => skill.includes(filterSkill) || filterSkill.includes(skill))
  );
}

function matchesKeywordFilter(activity, keyword) {
  if (!keyword) {
    return true;
  }

  const normalizedKeyword = keyword.toLowerCase();
  const requiredSkills = Array.isArray(activity.required_skills) ? activity.required_skills : [];
  const text = [
    String(activity.title ?? ''),
    String(activity.description ?? ''),
    getLocationText(activity.location),
    String(activity.province_code ?? ''),
    String(activity.ward_code ?? ''),
    requiredSkills.map((skill) => String(skill)).join(' '),
  ]
    .join(' ')
    .toLowerCase();

  return text.includes(normalizedKeyword);
}

function matchesLocationFilter(activity, locationFilter) {
  if (!locationFilter) {
    return true;
  }

  const normalizedLocationFilter = locationFilter.toLowerCase();
  const text = [
    getLocationText(activity.location),
    String(activity.province_code ?? ''),
    String(activity.ward_code ?? ''),
  ]
    .join(' ')
    .toLowerCase();

  return text.includes(normalizedLocationFilter);
}

function toSafeGuestLocation(location) {
  if (!location || typeof location !== 'object') {
    return {
      address: '',
      city: '',
      meetingPoint: '',
      lat: null,
      lng: null,
    };
  }

  const address = typeof location.address === 'string' ? location.address : '';
  const city =
    typeof location.city === 'string'
      ? location.city
      : typeof location.province === 'string'
        ? location.province
        : '';
  const meetingPoint =
    typeof location.formattedAddress === 'string' && location.formattedAddress.trim().length > 0
      ? location.formattedAddress
      : address;
  const lat = Number.isFinite(Number(location.lat)) ? Number(location.lat) : null;
  const lng = Number.isFinite(Number(location.lng)) ? Number(location.lng) : null;

  return {
    address,
    city,
    meetingPoint,
    lat,
    lng,
  };
}

function mapGuestPublishedActivity(activity, organizerById, participationCountByActivityId) {
  const organizer = organizerById.get(activity.organizer_id) ?? null;
  const requiredSkills = Array.isArray(activity.required_skills)
    ? activity.required_skills.map((skill) => String(skill).trim()).filter(Boolean)
    : [];

  return {
    id: activity.id,
    title: String(activity.title ?? ''),
    description: typeof activity.description === 'string' ? activity.description : '',
    coverImageUrl: String(activity.cover_image_url ?? ''),
    location: toSafeGuestLocation(activity.location),
    startTime: activity.start_time,
    endTime: activity.end_time,
    capacity: Number.isFinite(Number(activity.capacity)) ? Number(activity.capacity) : 0,
    currentParticipants: participationCountByActivityId.get(activity.id) ?? 0,
    requiredSkills,
    status: 'published',
    organizer: {
      id: activity.organizer_id ?? null,
      name: typeof organizer?.full_name === 'string' && organizer.full_name.trim().length > 0 ? organizer.full_name : 'Organizer',
      avatarUrl: typeof organizer?.avatar_url === 'string' ? organizer.avatar_url : '',
    },
  };
}

function safeMapGuestPublishedActivity(activity, organizerById, participationCountByActivityId) {
  try {
    return mapGuestPublishedActivity(activity, organizerById, participationCountByActivityId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to map public activity ${String(activity?.id ?? 'unknown')}: ${message}`);

    const fallbackId = String(activity?.id ?? '').trim();
    const fallbackTitle = String(activity?.title ?? '').trim() || 'Untitled activity';
    const fallbackCapacity = Number.isFinite(Number(activity?.capacity)) ? Number(activity.capacity) : 0;
    const fallbackCover = typeof activity?.cover_image_url === 'string' ? activity.cover_image_url : '';

    return {
      id: fallbackId,
      title: fallbackTitle,
      description: typeof activity?.description === 'string' ? activity.description : '',
      coverImageUrl: fallbackCover,
      location: {
        address: '',
        city: '',
        meetingPoint: '',
        lat: null,
        lng: null,
      },
      startTime: typeof activity?.start_time === 'string' ? activity.start_time : '',
      endTime: typeof activity?.end_time === 'string' ? activity.end_time : '',
      capacity: fallbackCapacity,
      currentParticipants: 0,
      requiredSkills: [],
      status: 'published',
      organizer: {
        id: null,
        name: 'Organizer',
        avatarUrl: '',
      },
    };
  }
}

function applyActivityReadVisibility({
  query,
  role,
  mine,
  statusFilter,
  userId,
}) {
  if (mine) {
    if (role !== 'admin') {
      query = query.eq('organizer_id', userId);
    }
    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }
    return { query, errorMessage: null };
  }

  if (role === 'volunteer') {
    if (statusFilter === 'draft') {
      return { query: null, errorMessage: 'Volunteers cannot access draft activities.' };
    }
    if (statusFilter === 'all') {
      query = query.in('status', ['published', 'completed', 'cancelled']);
    } else {
      query = query.eq('status', statusFilter);
    }
    return { query, errorMessage: null };
  }

  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  } else {
    query = query.eq('status', 'published');
  }

  return { query, errorMessage: null };
}

async function tryCreateNotification(payload) {
  try {
    await createNotificationRecord(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Notification create failed: ${message}`);
  }
}

async function resolveStoredLocation(payload, existingActivity = null) {
  const shouldResolve =
    Object.hasOwn(payload, 'location') || Object.hasOwn(payload, 'province_code') || Object.hasOwn(payload, 'ward_code');

  if (!shouldResolve) {
    return payload;
  }

  const rawLocation = Object.hasOwn(payload, 'location') ? payload.location : existingActivity?.location ?? null;
  if (!rawLocation || typeof rawLocation !== 'object') {
    const error = new Error('location.address is required.');
    error.statusCode = 400;
    throw error;
  }

  const address = typeof rawLocation.address === 'string' ? rawLocation.address.trim() : '';
  if (!address) {
    const error = new Error('location.address is required.');
    error.statusCode = 400;
    throw error;
  }

  const provinceCode = Object.hasOwn(payload, 'province_code') ? payload.province_code : existingActivity?.province_code ?? null;
  const wardCode = Object.hasOwn(payload, 'ward_code') ? payload.ward_code : existingActivity?.ward_code ?? null;

  if (!provinceCode) {
    const error = new Error('provinceCode is required.');
    error.statusCode = 400;
    throw error;
  }

  if (!wardCode) {
    const error = new Error('wardCode is required.');
    error.statusCode = 400;
    throw error;
  }

  const resolvedArea = await resolveProvinceAndWard({ provinceCode, wardCode });
  const previousLocation = existingActivity?.location && typeof existingActivity.location === 'object' ? existingActivity.location : null;
  const formattedAddress = buildFormattedAddress({
    address,
    ward: resolvedArea.wardName,
    province: resolvedArea.provinceName,
  });
  const addressChanged =
    address !== String(previousLocation?.address ?? '').trim() ||
    resolvedArea.provinceCode !== existingActivity?.province_code ||
    resolvedArea.wardCode !== existingActivity?.ward_code;

  const incomingGeocodedAt = normalizeOptionalText(rawLocation.geocodedAt);
  const previousGeocodedAt = normalizeOptionalText(previousLocation?.geocodedAt);
  const incomingFormattedAddress = normalizeOptionalText(rawLocation.formattedAddress);
  const previousFormattedAddress = normalizeOptionalText(previousLocation?.formattedAddress);
  const incomingLat = normalizeCoordinateValue(rawLocation.lat);
  const incomingLng = normalizeCoordinateValue(rawLocation.lng);
  const hasFreshCoordinates =
    Number.isFinite(incomingLat) &&
    Number.isFinite(incomingLng) &&
    (!addressChanged ||
      !existingActivity ||
      (incomingGeocodedAt && incomingGeocodedAt !== previousGeocodedAt) ||
      (incomingFormattedAddress && incomingFormattedAddress !== previousFormattedAddress));
  const lat = hasFreshCoordinates ? incomingLat : addressChanged ? null : normalizeCoordinateValue(previousLocation?.lat);
  const lng = hasFreshCoordinates ? incomingLng : addressChanged ? null : normalizeCoordinateValue(previousLocation?.lng);
  const hasValidCoordinates = Number.isFinite(lat) && Number.isFinite(lng);

  const mapProvider = hasValidCoordinates
    ? String(rawLocation.mapProvider ?? previousLocation?.mapProvider ?? '').trim() || null
    : null;
  const geocodedAt = hasValidCoordinates
    ? incomingGeocodedAt || normalizeOptionalText(previousLocation?.geocodedAt) || null
    : null;
  const geocodeConfidenceValue = hasValidCoordinates
    ? Number(rawLocation.geocodeConfidence ?? previousLocation?.geocodeConfidence ?? null)
    : null;
  const geocodeConfidence = Number.isFinite(geocodeConfidenceValue) ? geocodeConfidenceValue : null;

  return {
    ...payload,
    province_code: resolvedArea.provinceCode,
    ward_code: resolvedArea.wardCode,
    location: {
      address,
      city: resolvedArea.provinceName,
      province: resolvedArea.provinceName,
      ward: resolvedArea.wardName,
      formattedAddress,
      mapProvider,
      geocodedAt,
      geocodeConfidence,
      lat: hasValidCoordinates ? Number(lat.toFixed(7)) : null,
      lng: hasValidCoordinates ? Number(lng.toFixed(7)) : null,
    },
  };
}

function normalizeTimelineChoice(body, { partial = false } = {}) {
  const candidate = body.timelineChoice ?? body.timeline_choice ?? body.startTime ?? body.start_time ?? null;
  if (candidate == null || candidate === '') {
    if (partial) {
      return null;
    }
    throw new Error('timelineChoice is required.');
  }

  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('timelineChoice must be a valid date-time.');
  }

  return parsed.toISOString();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeParseJson(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function safeText(value, fallback = '') {
  if (value == null) {
    return fallback;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'string') {
    const parsed = safeParseJson(value);
    if (isPlainObject(parsed)) {
      return safeText(
        parsed.text ?? parsed.description ?? parsed.title ?? parsed.name ?? parsed.label,
        fallback
      );
    }
    return value;
  }
  if (isPlainObject(value)) {
    return safeText(value.text ?? value.description ?? value.title ?? value.name ?? value.label, fallback);
  }
  return fallback;
}

function normalizeTimelineType(value) {
  const normalized = safeText(value, '').trim().toLowerCase();
  if (normalized === 'opening' || normalized === 'session' || normalized === 'break' || normalized === 'closing') {
    return normalized;
  }
  if (!normalized) {
    return 'session';
  }
  return 'other';
}

function normalizeTimelineStatusToken(value) {
  const normalized = safeText(value, '').trim().toLowerCase();
  if (
    normalized === 'upcoming' ||
    normalized === 'in_progress' ||
    normalized === 'completed' ||
    normalized === 'cancelled'
  ) {
    return normalized;
  }
  return '';
}

function isTimelineCancelledStatus(value) {
  return normalizeTimelineStatusToken(value) === 'cancelled';
}

function computeTimelineAutoStatus(startTime, endTime, now = Date.now()) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'upcoming';
  }

  const startMs = start.getTime();
  const endMs = end.getTime();
  if (startMs > endMs) {
    return 'upcoming';
  }

  if (now < startMs) {
    return 'upcoming';
  }

  if (now <= endMs) {
    return 'in_progress';
  }

  return 'completed';
}

function resolveTimelineMilestoneStatus({ startTime, endTime, status }) {
  if (isTimelineCancelledStatus(status)) {
    return 'cancelled';
  }

  return computeTimelineAutoStatus(startTime, endTime);
}

function normalizeTimelineIsoString(value) {
  const raw = safeText(value, '').trim();
  if (!raw) {
    return '';
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return parsed.toISOString();
}

function normalizeOrderIndex(value, fallback = 0) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return fallback;
  }
  return Math.max(0, Math.trunc(normalized));
}

function normalizeTimelineDescriptionMeta(value) {
  if (isPlainObject(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = safeParseJson(value);
    if (isPlainObject(parsed)) {
      return parsed;
    }
  }
  return null;
}

function serializeTimelineDescription({
  description,
  type,
  status,
  endTime,
  orderIndex,
}) {
  return JSON.stringify({
    text: safeText(description, '').trim(),
    type: normalizeTimelineType(type),
    status: isTimelineCancelledStatus(status) ? 'cancelled' : null,
    endTime: normalizeTimelineIsoString(endTime),
    orderIndex: normalizeOrderIndex(orderIndex, 0),
  });
}

function normalizeTimelinePayload(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Body must be a JSON object.');
  }

  const meta = normalizeTimelineDescriptionMeta(body.description ?? null) ?? {};
  const payload = {};
  const titleCandidate = safeText(body.title ?? body.name ?? body.label ?? body.text, '').trim();
  if (titleCandidate) {
    payload.title = titleCandidate;
  } else if (!partial) {
    throw new Error('title is required.');
  }

  const descriptionValue = safeText(body.description ?? body.detail ?? body.notes ?? body.content, safeText(meta.text ?? meta.description, '')).trim();
  const typeValue = normalizeTimelineType(body.type ?? meta.type ?? (partial ? null : 'session'));
  const hasManualStatusInput = Object.hasOwn(body, 'status');
  const manualStatusSource = hasManualStatusInput ? body.status : meta.status;
  const manualStatusRaw = safeText(manualStatusSource, '').trim();
  const manualStatusToken = normalizeTimelineStatusToken(manualStatusSource);
  if (hasManualStatusInput) {
    if (manualStatusRaw && !manualStatusToken) {
      throw new Error('status is invalid. Only "cancelled" is allowed for manual milestone status.');
    }
  }
  const statusValue = manualStatusToken === 'cancelled' ? 'cancelled' : null;
  const endTimeValue = normalizeTimelineIsoString(body.endTime ?? body.end_time ?? meta.endTime ?? meta.end_time);
  const orderIndexValue = normalizeOrderIndex(
    body.orderIndex ?? body.order_index ?? meta.orderIndex ?? meta.order_index,
    0
  );

  const timelineChoice = normalizeTimelineChoice(body, { partial });
  if (timelineChoice && endTimeValue && new Date(timelineChoice).getTime() > new Date(endTimeValue).getTime()) {
    throw new Error('startTime cannot be later than endTime for a timeline milestone.');
  }
  if (timelineChoice) {
    payload.timeline_choice = timelineChoice;
  }

  const shouldWriteDescription =
    Object.hasOwn(body, 'description') ||
    Object.hasOwn(body, 'detail') ||
    Object.hasOwn(body, 'notes') ||
    Object.hasOwn(body, 'content') ||
    Object.hasOwn(body, 'type') ||
    Object.hasOwn(body, 'status') ||
    Object.hasOwn(body, 'endTime') ||
    Object.hasOwn(body, 'end_time') ||
    Object.hasOwn(body, 'orderIndex') ||
    Object.hasOwn(body, 'order_index') ||
    !partial;

  if (shouldWriteDescription) {
    payload.description = serializeTimelineDescription({
      description: descriptionValue,
      type: typeValue,
      status: statusValue,
      endTime: endTimeValue,
      orderIndex: orderIndexValue,
    });
  }

  if (partial && Object.keys(payload).length === 0) {
    throw new Error('No valid timeline fields provided.');
  }

  return payload;
}

function extractTimelineEndTimeFromDescription(descriptionValue) {
  const meta = normalizeTimelineDescriptionMeta(descriptionValue);
  if (!meta) {
    return '';
  }
  return normalizeTimelineIsoString(meta.endTime ?? meta.end_time);
}

function extractTimelineTypeFromDescription(descriptionValue) {
  const meta = normalizeTimelineDescriptionMeta(descriptionValue);
  return normalizeTimelineType(meta?.type);
}

function normalizeTimelineDuplicateText(value) {
  return safeText(value, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function buildTimelineDuplicateSignature({
  title,
  type,
  startTime,
  endTime,
}) {
  return JSON.stringify({
    title: normalizeTimelineDuplicateText(title),
    type: normalizeTimelineType(type),
    startTime: normalizeTimelineIsoString(startTime),
    endTime: normalizeTimelineIsoString(endTime),
  });
}

function buildTimelineDuplicateSignatureFromRow(row) {
  return buildTimelineDuplicateSignature({
    title: row?.title,
    type: extractTimelineTypeFromDescription(row?.description),
    startTime: row?.timeline_choice,
    endTime: extractTimelineEndTimeFromDescription(row?.description),
  });
}

async function findDuplicateTimelineMilestone({
  activityId,
  title,
  type,
  startTime,
  endTime,
  excludeId = null,
}) {
  const { data, error } = await supabaseAdmin
    .from('activities_timeline')
    .select(timelineColumns)
    .eq('activity_id', activityId)
    .eq('timeline_choice', normalizeTimelineIsoString(startTime));

  if (error) {
    throw error;
  }

  const targetSignature = buildTimelineDuplicateSignature({
    title,
    type,
    startTime,
    endTime,
  });

  return (data ?? []).find((row) => {
    if (excludeId && safeText(row?.id) === safeText(excludeId)) {
      return false;
    }
    return buildTimelineDuplicateSignatureFromRow(row) === targetSignature;
  }) ?? null;
}

function assertTimelineWithinActivityWindow({
  activity,
  milestoneStartTime,
  milestoneEndTime,
}) {
  const activityStart = normalizeTimelineIsoString(activity?.start_time);
  const activityEnd = normalizeTimelineIsoString(activity?.end_time);
  const milestoneStart = normalizeTimelineIsoString(milestoneStartTime);
  const milestoneEnd = normalizeTimelineIsoString(milestoneEndTime);

  if (!activityStart || !activityEnd) {
    throw new Error('Activity time window is invalid.');
  }

  if (!milestoneStart) {
    throw new Error('timelineChoice is required.');
  }

  const activityStartMs = new Date(activityStart).getTime();
  const activityEndMs = new Date(activityEnd).getTime();
  const milestoneStartMs = new Date(milestoneStart).getTime();

  if (milestoneStartMs < activityStartMs) {
    throw new Error('Timeline milestone start time must be within the activity time window.');
  }

  if (milestoneStartMs > activityEndMs) {
    throw new Error('Timeline milestone start time must be within the activity time window.');
  }

  if (milestoneEnd) {
    const milestoneEndMs = new Date(milestoneEnd).getTime();
    if (milestoneEndMs > activityEndMs) {
      throw new Error('Timeline milestone end time must be within the activity time window.');
    }
  }
}

function normalizeTimelineItem(row, fallbackIndex = 0) {
  const item = isPlainObject(row) ? row : {};
  const descriptionSource = item.description ?? item.detail ?? item.notes ?? item.content ?? item.metadata ?? null;
  const descriptionMeta = normalizeTimelineDescriptionMeta(descriptionSource) ?? {};

  const title = safeText(item.title ?? item.name ?? item.label ?? item.text, 'Untitled milestone').trim() || 'Untitled milestone';
  const description = safeText(
    descriptionSource,
    ''
  ).trim();

  const startTime = normalizeTimelineIsoString(
    item.timeline_choice ?? item.timelineChoice ?? item.start_time ?? item.startTime
  );
  const endTime = normalizeTimelineIsoString(
    item.end_time ?? item.endTime ?? descriptionMeta.endTime ?? descriptionMeta.end_time
  );

  const orderIndex = normalizeOrderIndex(
    item.order_index ?? item.orderIndex ?? descriptionMeta.orderIndex ?? descriptionMeta.order_index,
    fallbackIndex
  );

  return {
    id: safeText(item.id, `timeline-${fallbackIndex}`),
    activityId: safeText(item.activity_id ?? item.activityId, ''),
    title,
    description,
    type: normalizeTimelineType(item.type ?? descriptionMeta.type),
    status: resolveTimelineMilestoneStatus({
      startTime,
      endTime,
      status: item.status ?? descriptionMeta.status,
    }),
    startTime,
    endTime,
    orderIndex,
    createdAt: normalizeTimelineIsoString(item.created_at ?? item.createdAt),
  };
}

function compareTimelineItems(left, right) {
  if (left.orderIndex !== right.orderIndex) {
    return left.orderIndex - right.orderIndex;
  }
  const leftStart = left.startTime ? new Date(left.startTime).getTime() : Number.MAX_SAFE_INTEGER;
  const rightStart = right.startTime ? new Date(right.startTime).getTime() : Number.MAX_SAFE_INTEGER;
  return leftStart - rightStart;
}

function normalizeTimelineItems(input) {
  if (!input) {
    return [];
  }

  const rows = Array.isArray(input) ? input : [input];
  return rows
    .map((row, index) => normalizeTimelineItem(row, index))
    .sort(compareTimelineItems)
    .map((item, index) => ({
      ...item,
      orderIndex: index,
    }));
}

async function getTimelineActivity(activityId) {
  return getActivityById(activityId);
}

function canReadTimeline(activity, role, userId) {
  if (role === 'admin') {
    return true;
  }
  if (activity.organizer_id === userId) {
    return true;
  }
  return String(activity.status ?? '').toLowerCase() === 'published';
}

function canEditTimeline(activity, role, userId) {
  if (role === 'admin') {
    return true;
  }
  if (!canWriteActivities(role)) {
    return false;
  }
  return activity.organizer_id === userId;
}

router.get('/public/activities', async (req, res) => {
  const requestedLimit = Number(req.query.limit ?? 120);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 300)
    : 120;

  try {
    const activities = await listPublishedActivitiesForGuest(limit);
    const activityIds = activities.map((activity) => activity.id).filter(Boolean);
    const organizerIds = activities.map((activity) => activity.organizer_id).filter(Boolean);

    let organizerById = new Map();
    let participationCountByActivityId = new Map();

    try {
      organizerById = await getOrganizerPublicProfilesByIds(organizerIds);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Public organizer lookup failed. Falling back to safe defaults. ${message}`);
    }

    try {
      participationCountByActivityId = await getActiveParticipationCountsByActivityIds(activityIds);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Public participation count lookup failed. Falling back to zero counts. ${message}`);
    }

    const publishedActivities = activities.map((activity) =>
      safeMapGuestPublishedActivity(activity, organizerById, participationCountByActivityId)
    );

    res.json({ activities: publishedActivities });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load public activities.';
    res.status(500).json({ message });
  }
});

router.get('/public/activities/:id', async (req, res) => {
  try {
    const activity = await getPublishedActivityForGuestById(req.params.id);
    if (!activity) {
      res.status(404).json({ message: 'Activity not found.' });
      return;
    }

    let organizerById = new Map();
    let participationCountByActivityId = new Map();

    try {
      organizerById = await getOrganizerPublicProfilesByIds([activity.organizer_id]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Public detail organizer lookup failed. Falling back to safe defaults. ${message}`);
    }

    try {
      participationCountByActivityId = await getActiveParticipationCountsByActivityIds([activity.id]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Public detail participation lookup failed. Falling back to zero count. ${message}`);
    }

    res.json({
      activity: safeMapGuestPublishedActivity(activity, organizerById, participationCountByActivityId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load public activity.';
    res.status(500).json({ message });
  }
});

async function handleActivityDetail(req, res) {
  const activityId = req.params.id;

  let data;
  try {
    data = await getActivityById(activityId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load activity.';
    res.status(500).json({ message });
    return;
  }

  if (!data) {
    res.status(404).json({ message: 'Activity not found.' });
    return;
  }

  const role = String(req.auth?.profile?.role ?? '');
  const isOwner = data.organizer_id === req.auth.user.id;
  const canAccess = data.status === 'published' || isOwner || role === 'admin';
  if (!canAccess) {
    res.status(403).json({ message: 'You do not have permission to access this activity.' });
    return;
  }

  res.json({ activity: withResolvedActivityCoverImage(data) });
}

router.get('/activities/:id/timeline', requireAuth, async (req, res) => {
  const activityId = req.params.id;
  let activity;
  try {
    activity = await getTimelineActivity(activityId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load activity.';
    res.status(500).json({ message });
    return;
  }

  if (!activity) {
    res.status(404).json({ message: 'Activity not found.' });
    return;
  }

  const role = String(req.auth?.profile?.role ?? '');
  const userId = req.auth.user.id;
  if (!canReadTimeline(activity, role, userId)) {
    res.status(403).json({ message: 'You do not have permission to access this timeline.' });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('activities_timeline')
    .select(timelineColumns)
    .eq('activity_id', activityId)
    .order('timeline_choice', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    res.status(500).json({ message: error.message });
    return;
  }

  res.json({ timeline: normalizeTimelineItems(data ?? []) });
});

router.post('/activities/:id/timeline', requireAuth, async (req, res) => {
  const activityId = req.params.id;
  let activity;
  try {
    activity = await getTimelineActivity(activityId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load activity.';
    res.status(500).json({ message });
    return;
  }

  if (!activity) {
    res.status(404).json({ message: 'Activity not found.' });
    return;
  }

  const role = String(req.auth?.profile?.role ?? '');
  const userId = req.auth.user.id;
  if (!canEditTimeline(activity, role, userId)) {
    res.status(403).json({ message: 'Only organizer/admin can update this timeline.' });
    return;
  }

  let payload;
  try {
    payload = normalizeTimelinePayload(req.body, { partial: false });
    assertTimelineWithinActivityWindow({
      activity,
      milestoneStartTime: payload.timeline_choice,
      milestoneEndTime: extractTimelineEndTimeFromDescription(payload.description),
    });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid timeline payload.' });
    return;
  }

  try {
    const duplicate = await findDuplicateTimelineMilestone({
      activityId,
      title: payload.title,
      type: extractTimelineTypeFromDescription(payload.description),
      startTime: payload.timeline_choice,
      endTime: extractTimelineEndTimeFromDescription(payload.description),
    });
    if (duplicate) {
      res.status(409).json({
        message: 'A milestone with the same title, type, start time, and end time already exists.',
      });
      return;
    }
  } catch (duplicateLookupError) {
    res.status(500).json({
      message: duplicateLookupError instanceof Error ? duplicateLookupError.message : 'Failed to validate duplicate milestone.',
    });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('activities_timeline')
    .insert({
      activity_id: activityId,
      ...payload,
    })
    .select(timelineColumns)
    .maybeSingle();

  if (error) {
    if (error.code === '23514' || error.code === '22P02' || error.code === '23502') {
      res.status(400).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: error.message });
    return;
  }

  res.status(201).json({ milestone: normalizeTimelineItem(data ?? null, 0) });
});

router.patch('/activities/:id/timeline/:timelineId', requireAuth, async (req, res) => {
  const activityId = req.params.id;
  const timelineId = req.params.timelineId;

  let activity;
  try {
    activity = await getTimelineActivity(activityId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load activity.';
    res.status(500).json({ message });
    return;
  }

  if (!activity) {
    res.status(404).json({ message: 'Activity not found.' });
    return;
  }

  const role = String(req.auth?.profile?.role ?? '');
  const userId = req.auth.user.id;
  if (!canEditTimeline(activity, role, userId)) {
    res.status(403).json({ message: 'Only organizer/admin can update this timeline.' });
    return;
  }

  let payload;
  try {
    payload = normalizeTimelinePayload(req.body, { partial: true });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid timeline payload.' });
    return;
  }

  const { data: existingMilestone, error: existingMilestoneError } = await supabaseAdmin
    .from('activities_timeline')
    .select(timelineColumns)
    .eq('id', timelineId)
    .eq('activity_id', activityId)
    .maybeSingle();

  if (existingMilestoneError) {
    res.status(500).json({ message: existingMilestoneError.message });
    return;
  }

  if (!existingMilestone) {
    res.status(404).json({ message: 'Timeline milestone not found.' });
    return;
  }

  const mergedMilestoneStartTime = payload.timeline_choice ?? existingMilestone.timeline_choice;
  const mergedMilestoneTitle = payload.title ?? existingMilestone.title;
  const mergedMilestoneType = Object.hasOwn(payload, 'description')
    ? extractTimelineTypeFromDescription(payload.description)
    : extractTimelineTypeFromDescription(existingMilestone.description);
  const mergedMilestoneEndTime = Object.hasOwn(payload, 'description')
    ? extractTimelineEndTimeFromDescription(payload.description)
    : extractTimelineEndTimeFromDescription(existingMilestone.description);

  try {
    assertTimelineWithinActivityWindow({
      activity,
      milestoneStartTime: mergedMilestoneStartTime,
      milestoneEndTime: mergedMilestoneEndTime,
    });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid timeline payload.' });
    return;
  }

  try {
    const duplicate = await findDuplicateTimelineMilestone({
      activityId,
      title: mergedMilestoneTitle,
      type: mergedMilestoneType,
      startTime: mergedMilestoneStartTime,
      endTime: mergedMilestoneEndTime,
      excludeId: timelineId,
    });

    if (duplicate) {
      res.status(409).json({
        message: 'A milestone with the same title, type, start time, and end time already exists.',
      });
      return;
    }
  } catch (duplicateLookupError) {
    res.status(500).json({
      message: duplicateLookupError instanceof Error ? duplicateLookupError.message : 'Failed to validate duplicate milestone.',
    });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('activities_timeline')
    .update(payload)
    .eq('id', timelineId)
    .eq('activity_id', activityId)
    .select(timelineColumns)
    .maybeSingle();

  if (error) {
    if (error.code === '23514' || error.code === '22P02' || error.code === '23502') {
      res.status(400).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: error.message });
    return;
  }

  if (!data) {
    res.status(404).json({ message: 'Timeline milestone not found.' });
    return;
  }

  res.json({ milestone: normalizeTimelineItem(data ?? null, 0) });
});

router.delete('/activities/:id/timeline/:timelineId', requireAuth, async (req, res) => {
  const activityId = req.params.id;
  const timelineId = req.params.timelineId;

  let activity;
  try {
    activity = await getTimelineActivity(activityId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load activity.';
    res.status(500).json({ message });
    return;
  }

  if (!activity) {
    res.status(404).json({ message: 'Activity not found.' });
    return;
  }

  const role = String(req.auth?.profile?.role ?? '');
  const userId = req.auth.user.id;
  if (!canEditTimeline(activity, role, userId)) {
    res.status(403).json({ message: 'Only organizer/admin can update this timeline.' });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('activities_timeline')
    .delete()
    .eq('id', timelineId)
    .eq('activity_id', activityId)
    .select('id')
    .maybeSingle();

  if (error) {
    res.status(500).json({ message: error.message });
    return;
  }

  if (!data) {
    res.status(404).json({ message: 'Timeline milestone not found.' });
    return;
  }

  res.json({ success: true });
});

router.get('/activities', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '');
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const mine = String(req.query.mine ?? 'false').toLowerCase() === 'true';
  const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : 'all';
  const requestedLimit = Number(req.query.limit ?? 24);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
    : 24;

  if (statusFilter !== 'all' && !validActivityStatuses.has(statusFilter)) {
    res.status(400).json({
      message: `Invalid status filter. Allowed: all, ${Array.from(validActivityStatuses).join(', ')}`,
    });
    return;
  }

  if (mine && !canWriteActivities(role)) {
    res.status(403).json({ message: 'Only organizers/admins can query own activities.' });
    return;
  }

  let query = supabaseAdmin
    .from('activities')
    .select(activityColumns)
    .is('deleted_at', null)
    .order('start_time', { ascending: true })
    .limit(limit);

  const visibility = applyActivityReadVisibility({
    query,
    role,
    mine,
    statusFilter,
    userId: req.auth.user.id,
  });
  if (visibility.errorMessage) {
    res.status(403).json({ message: visibility.errorMessage });
    return;
  }
  query = visibility.query;

  if (search) {
    query = query.ilike('title', `%${search}%`);
  }

  const { data, error } = await query;
  if (error) {
    res.status(500).json({ message: error.message });
    return;
  }

  res.json({ activities: mapActivitiesWithResolvedCoverImage(data) });
});

router.get('/activities/search', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '');
  const keyword =
    typeof req.query.keyword === 'string'
      ? req.query.keyword.trim()
      : typeof req.query.search === 'string'
        ? req.query.search.trim()
        : typeof req.query.q === 'string'
          ? req.query.q.trim()
          : '';
  const locationFilter = typeof req.query.location === 'string' ? req.query.location.trim() : '';
  const skillFilters = normalizeSkillFilters(req.query.skill ?? req.query.skills ?? '');
  const mine = String(req.query.mine ?? 'false').toLowerCase() === 'true';
  const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : 'all';
  const requestedLimit = Number(req.query.limit ?? 60);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 300)
    : 60;

  if (statusFilter !== 'all' && !validActivityStatuses.has(statusFilter)) {
    res.status(400).json({
      message: `Invalid status filter. Allowed: all, ${Array.from(validActivityStatuses).join(', ')}`,
    });
    return;
  }

  if (mine && !canWriteActivities(role)) {
    res.status(403).json({ message: 'Only organizers/admins can query own activities.' });
    return;
  }

  const dateOnlyRange = parseDateOnlyRange(typeof req.query.date === 'string' ? req.query.date : '');
  if (req.query.date && !dateOnlyRange) {
    res.status(400).json({ message: 'date must be in YYYY-MM-DD format.' });
    return;
  }

  const rawDateFrom =
    typeof req.query.dateFrom === 'string'
      ? req.query.dateFrom
      : typeof req.query.from === 'string'
        ? req.query.from
        : typeof req.query.startDate === 'string'
          ? req.query.startDate
          : '';
  const rawDateTo =
    typeof req.query.dateTo === 'string'
      ? req.query.dateTo
      : typeof req.query.to === 'string'
        ? req.query.to
        : typeof req.query.endDate === 'string'
          ? req.query.endDate
          : '';

  const dateFrom = parseDateBoundary(rawDateFrom, 'start');
  const dateTo = parseDateBoundary(rawDateTo, 'end');

  if (rawDateFrom && !dateFrom) {
    res.status(400).json({ message: 'dateFrom must be a valid date (ISO string or YYYY-MM-DD).' });
    return;
  }

  if (rawDateTo && !dateTo) {
    res.status(400).json({ message: 'dateTo must be a valid date (ISO string or YYYY-MM-DD).' });
    return;
  }

  if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
    res.status(400).json({ message: 'dateFrom must be earlier than or equal to dateTo.' });
    return;
  }

  let query = supabaseAdmin
    .from('activities')
    .select(activityColumns)
    .is('deleted_at', null)
    .order('start_time', { ascending: true })
    .limit(limit);

  const visibility = applyActivityReadVisibility({
    query,
    role,
    mine,
    statusFilter,
    userId: req.auth.user.id,
  });
  if (visibility.errorMessage) {
    res.status(403).json({ message: visibility.errorMessage });
    return;
  }
  query = visibility.query;

  if (dateOnlyRange) {
    query = query.gte('start_time', dateOnlyRange.startIso).lt('start_time', dateOnlyRange.endIso);
  } else {
    if (dateFrom) {
      query = query.gte('start_time', dateFrom);
    }
    if (dateTo) {
      query = query.lte('start_time', dateTo);
    }
  }

  const { data, error } = await query;
  if (error) {
    res.status(500).json({ message: error.message });
    return;
  }

  const filteredActivities = (data ?? [])
    .filter((activity) => matchesKeywordFilter(activity, keyword))
    .filter((activity) => matchesLocationFilter(activity, locationFilter))
    .filter((activity) => matchesSkillFilter(activity, skillFilters));

  res.json({ activities: mapActivitiesWithResolvedCoverImage(filteredActivities) });
});

router.get('/activities/:id', requireAuth, handleActivityDetail);
router.get('/activity/:id', requireAuth, handleActivityDetail);

router.post('/activities', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '');
  if (!canWriteActivities(role)) {
    res.status(403).json({ message: 'Organizer or admin role required.' });
    return;
  }

  let payload;
  try {
    payload = normalizeActivityPayload(req.body, { partial: false });
    payload = await resolveStoredLocation(payload);
  } catch (error) {
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 400;
    res.status(statusCode).json({ message: error instanceof Error ? error.message : 'Invalid payload.' });
    return;
  }

  const activityStartTime = new Date(payload.start_time);
  const activityStartTimestamp = activityStartTime.getTime();
  if (!Number.isFinite(activityStartTimestamp)) {
    res.status(400).json({ message: 'startTime must be a valid date-time.' });
    return;
  }

  if (activityStartTimestamp <= Date.now()) {
    res.status(400).json({ message: 'startTime must be in the future for new activities.' });
    return;
  }

  const now = new Date().toISOString();
  const createPayload = {
    ...payload,
    organizer_id: req.auth.user.id,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabaseAdmin
    .from('activities')
    .insert(createPayload)
    .select(activityColumns)
    .maybeSingle();

  if (error) {
    if (error.code === '23514' || error.code === '22P02' || error.code === '23502') {
      res.status(400).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: error.message });
    return;
  }

  res.status(201).json({ activity: withResolvedActivityCoverImage(data) });
});

router.patch('/activities/:id', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '');
  if (!canWriteActivities(role)) {
    res.status(403).json({ message: 'Organizer or admin role required.' });
    return;
  }

  const activityId = req.params.id;
  const { data: existingActivity, error: existingError } = await supabaseAdmin
    .from('activities')
    .select(activityColumns)
    .eq('id', activityId)
    .is('deleted_at', null)
    .maybeSingle();

  if (existingError) {
    res.status(500).json({ message: existingError.message });
    return;
  }

  if (!existingActivity) {
    res.status(404).json({ message: 'Activity not found.' });
    return;
  }

  if (role !== 'admin' && existingActivity.organizer_id !== req.auth.user.id) {
    res.status(403).json({ message: 'You can update only your own activities.' });
    return;
  }

  const existingActivityEndTime = new Date(existingActivity.end_time);
  if (!Number.isNaN(existingActivityEndTime.getTime()) && existingActivityEndTime.getTime() <= Date.now()) {
    res.status(400).json({ message: 'Cannot edit an activity that has already ended.' });
    return;
  }

  let payload;
  try {
    payload = normalizeActivityPayload(req.body, { partial: true });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid payload.' });
    return;
  }

  if (!Object.hasOwn(payload, 'cover_image_url') && !existingActivity.cover_image_url) {
    payload.cover_image_url = resolveActivityCoverImageUrl(null);
  }

  try {
    payload = await resolveStoredLocation(payload, existingActivity);
  } catch (error) {
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 400;
    res.status(statusCode).json({ message: error instanceof Error ? error.message : 'Invalid location payload.' });
    return;
  }

  const mergedStartTime = payload.start_time ?? existingActivity.start_time;
  const mergedEndTime = payload.end_time ?? existingActivity.end_time;
  if (mergedStartTime && mergedEndTime && new Date(mergedEndTime) <= new Date(mergedStartTime)) {
    res.status(400).json({ message: 'endTime must be later than startTime.' });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('activities')
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', activityId)
    .is('deleted_at', null)
    .select(activityColumns)
    .maybeSingle();

  if (error) {
    if (error.code === '23514' || error.code === '22P02' || error.code === '23502') {
      res.status(400).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: error.message });
    return;
  }

  if (!data) {
    res.status(404).json({ message: 'Activity not found.' });
    return;
  }

  res.json({ activity: withResolvedActivityCoverImage(data) });
});

router.delete('/activities/:id', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '');
  if (!canWriteActivities(role)) {
    res.status(403).json({ message: 'Organizer or admin role required.' });
    return;
  }

  const activityId = req.params.id;

  const { data: existingActivity, error: existingError } = await supabaseAdmin
    .from('activities')
    .select('id, organizer_id, title')
    .eq('id', activityId)
    .is('deleted_at', null)
    .maybeSingle();

  if (existingError) {
    res.status(500).json({ message: existingError.message });
    return;
  }

  if (!existingActivity) {
    res.status(404).json({ message: 'Activity not found.' });
    return;
  }

  if (role !== 'admin' && existingActivity.organizer_id !== req.auth.user.id) {
    res.status(403).json({ message: 'You can delete only your own activities.' });
    return;
  }

  const { data: registrations, error: registrationsError } = await supabaseAdmin
    .from('activity_participations')
    .select('id, volunteer_id, status')
    .eq('activity_id', activityId);

  if (registrationsError) {
    res.status(500).json({ message: registrationsError.message });
    return;
  }

  const registrationsToCancel = (registrations ?? []).filter((registration) => {
    const status = String(registration.status ?? '').toLowerCase();
    return status === 'assigned' || status === 'pending' || status === 'approved';
  });

  if (registrationsToCancel.length > 0) {
    const { error: cancelRegistrationsError } = await supabaseAdmin
      .from('activity_participations')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .in(
        'id',
        registrationsToCancel
          .map((registration) => registration.id)
          .filter((id) => typeof id === 'string' && id.length > 0)
      );

    if (cancelRegistrationsError) {
      res.status(500).json({ message: cancelRegistrationsError.message });
      return;
    }
  }

  const { error } = await supabaseAdmin
    .from('activities')
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', activityId)
    .is('deleted_at', null);

  if (error) {
    res.status(500).json({ message: error.message });
    return;
  }

  const activeOrCompletedRegistrations = Array.from(
    new Map(
      (registrations ?? [])
        .filter((registration) => {
          const status = String(registration.status ?? '').toLowerCase();
          return Boolean(registration.volunteer_id) && status !== 'cancelled' && status !== 'rejected';
        })
        .map((registration) => [registration.volunteer_id, registration])
    ).values()
  );

  await Promise.all(
    activeOrCompletedRegistrations.map((registration) => {
      const status = String(registration.status ?? '').toLowerCase();
      const isCompletedRecord = status === 'checked_in';

      return tryCreateNotification({
        userId: registration.volunteer_id,
        title: 'Activity Removed',
        message: isCompletedRecord
          ? `The organizer removed "${existingActivity.title}". Your completed participation record has been preserved in history.`
          : `The organizer removed "${existingActivity.title}". Your registration is no longer active, and the record has been preserved in history.`,
        type: 'message',
        data: {
          activityId,
          registrationId: registration.id,
          status: isCompletedRecord ? 'completed' : 'cancelled',
          activityDeleted: true,
        },
      });
    })
  );

  if (role === 'admin' && existingActivity.organizer_id && existingActivity.organizer_id !== req.auth.user.id) {
    await tryCreateNotification({
      userId: existingActivity.organizer_id,
      title: 'Activity Deleted by Admin',
      message: `Your activity "${existingActivity.title}" has been deleted by an administrator.`,
      type: 'message',
      data: {
        activityId,
        deletedByAdmin: true,
      },
    });
  }

  res.json({ success: true, message: 'Activity deleted successfully.' });
});

export default router;
