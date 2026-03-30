import { Router } from 'express';
import { activityColumns, validActivityStatuses } from '../config/constants.js';
import { supabaseAdmin } from '../database/supabase.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { getProvinceByCode, getWardByCode } from '../locations/locations.service.js';
import { createNotificationRecord } from '../notifications/notifications.service.js';
import { normalizeActivityPayload } from './activities.validation.js';
import { canWriteActivities, getActivityById } from './activities.service.js';

const router = Router();

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

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
    typeof location.city === 'string' ? location.city : '',
    typeof location.ward === 'string' ? location.ward : '',
    typeof location.district === 'string' ? location.district : '',
    typeof location.province === 'string' ? location.province : '',
  ];

  return parts.join(' ').toLowerCase();
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

  const [province, ward] = await Promise.all([getProvinceByCode(provinceCode), getWardByCode(wardCode)]);

  if (!province) {
    const error = new Error('Selected province was not found.');
    error.statusCode = 400;
    throw error;
  }

  if (!ward) {
    const error = new Error('Selected ward was not found.');
    error.statusCode = 400;
    throw error;
  }

  if (ward.province_code !== province.code) {
    const error = new Error('Selected ward does not belong to the selected province.');
    error.statusCode = 400;
    throw error;
  }

  const lat = Number(rawLocation.lat ?? 0);
  const lng = Number(rawLocation.lng ?? 0);

  return {
    ...payload,
    province_code: province.code,
    ward_code: ward.code,
    location: {
      ...rawLocation,
      address,
      city: province.name,
      province: province.name,
      ward: ward.name,
      lat: Number.isFinite(lat) ? lat : 0,
      lng: Number.isFinite(lng) ? lng : 0,
    },
  };
}

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

  res.json({ activity: data });
}

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

  res.json({ activities: data ?? [] });
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

  res.json({ activities: filteredActivities });
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

  res.status(201).json({ activity: data });
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

  let payload;
  try {
    payload = normalizeActivityPayload(req.body, { partial: true });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid payload.' });
    return;
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

  res.json({ activity: data });
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

  res.json({ success: true, message: 'Activity deleted successfully.' });
});

export default router;
