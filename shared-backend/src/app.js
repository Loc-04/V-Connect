import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? process.env.CORS_ORIGIN ?? 'http://localhost:5173';
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD_RESET_REDIRECT_TO =
  process.env.PASSWORD_RESET_REDIRECT_TO ??
  `${FRONTEND_ORIGIN.split(',')[0]?.trim().replace(/\/+$/, '') ?? 'http://localhost:5173'}/reset-password`;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) / SUPABASE_SERVICE_ROLE_KEY in shared-backend/.env');
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const app = express();
app.use(
  cors({
    origin: FRONTEND_ORIGIN.split(',').map((origin) => origin.trim()),
    credentials: false,
  })
);
app.use(express.json());

const userColumns = 'id, role, full_name, phone, avatar_url, status, created_at, updated_at, deleted_at';
const volunteerColumns = 'user_id, skills, interests, availability, total_hours, updated_at';
const activityColumns =
  'id, title, description, location, start_time, end_time, capacity, required_skills, status, organizer_id, created_at, updated_at, deleted_at';
const notificationColumns = 'id, user_id, title, message, type, data, created_at, read_at';
const validRoles = new Set(['admin', 'organizer', 'volunteer']);
const validActivityStatuses = new Set(['draft', 'published', 'completed', 'cancelled']);
const activityWriteRoles = new Set(['admin', 'organizer']);

function extractBearerToken(req) {
  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return null;
  }
  return authorization.slice('Bearer '.length).trim();
}

async function getProfileByUserId(userId) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select(userColumns)
    .eq('id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}

async function getVolunteerProfileByUserId(userId) {
  const { data, error } = await supabaseAdmin
    .from('volunteer_profiles')
    .select(volunteerColumns)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeStringArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array of strings.`);
  }

  const normalized = value.map((item) => String(item).trim()).filter((item) => item.length > 0);
  if (normalized.length !== value.length) {
    throw new Error(`${fieldName} contains invalid empty values.`);
  }

  return normalized;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeActivityLocation(value) {
  if (typeof value === 'string') {
    const address = value.trim();
    if (!address) {
      throw new Error('location cannot be empty.');
    }

    return {
      address,
      city: '',
      lat: 0,
      lng: 0,
    };
  }

  if (!isPlainObject(value)) {
    throw new Error('location must be an object or string.');
  }

  const address = typeof value.address === 'string' ? value.address.trim() : '';
  if (!address) {
    throw new Error('location.address is required.');
  }

  const city = typeof value.city === 'string' ? value.city.trim() : '';
  const lat = Number(value.lat ?? 0);
  const lng = Number(value.lng ?? 0);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('location.lat and location.lng must be numbers.');
  }

  return {
    address,
    city,
    lat,
    lng,
  };
}

function toIsoDateString(value, fieldName) {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be an ISO date string.`);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid date.`);
  }

  return parsed.toISOString();
}

function normalizeActivityPayload(body, { partial = false } = {}) {
  if (!isPlainObject(body)) {
    throw new Error('Body must be a JSON object.');
  }

  const payload = {};

  if (Object.hasOwn(body, 'title')) {
    if (typeof body.title !== 'string') {
      throw new Error('title must be a string.');
    }
    const title = body.title.trim();
    if (!title) {
      throw new Error('title cannot be empty.');
    }
    payload.title = title;
  } else if (!partial) {
    throw new Error('title is required.');
  }

  if (Object.hasOwn(body, 'description')) {
    if (typeof body.description !== 'string') {
      throw new Error('description must be a string.');
    }
    payload.description = body.description.trim();
  } else if (!partial) {
    payload.description = '';
  }

  if (Object.hasOwn(body, 'location')) {
    payload.location = normalizeActivityLocation(body.location);
  } else if (!partial) {
    payload.location = {
      address: 'TBD',
      city: '',
      lat: 0,
      lng: 0,
    };
  }

  if (Object.hasOwn(body, 'startTime')) {
    payload.start_time = toIsoDateString(body.startTime, 'startTime');
  } else if (!partial) {
    throw new Error('startTime is required.');
  }

  if (Object.hasOwn(body, 'endTime')) {
    payload.end_time = toIsoDateString(body.endTime, 'endTime');
  } else if (!partial) {
    throw new Error('endTime is required.');
  }

  if (Object.hasOwn(body, 'capacity')) {
    const capacity = Number(body.capacity);
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error('capacity must be a positive integer.');
    }
    payload.capacity = capacity;
  } else if (!partial) {
    throw new Error('capacity is required.');
  }

  if (Object.hasOwn(body, 'requiredSkills')) {
    payload.required_skills = normalizeStringArray(body.requiredSkills, 'requiredSkills');
  } else if (!partial) {
    payload.required_skills = [];
  }

  if (Object.hasOwn(body, 'status')) {
    if (typeof body.status !== 'string') {
      throw new Error('status must be a string.');
    }
    const normalizedStatus = body.status.trim().toLowerCase();
    if (!validActivityStatuses.has(normalizedStatus)) {
      throw new Error(`Invalid status. Allowed: ${Array.from(validActivityStatuses).join(', ')}`);
    }
    payload.status = normalizedStatus;
  } else if (!partial) {
    payload.status = 'draft';
  }

  if (partial && Object.keys(payload).length === 0) {
    throw new Error('No valid activity fields provided.');
  }

  const hasBothTimeValues = Object.hasOwn(payload, 'start_time') && Object.hasOwn(payload, 'end_time');
  if (hasBothTimeValues) {
    const startTime = new Date(payload.start_time);
    const endTime = new Date(payload.end_time);
    if (endTime <= startTime) {
      throw new Error('endTime must be later than startTime.');
    }
  }

  return payload;
}

function normalizeNotificationPayload(body) {
  if (!isPlainObject(body)) {
    throw new Error('Body must be a JSON object.');
  }

  const userId =
    typeof body.userId === 'string'
      ? body.userId.trim()
      : typeof body.user_id === 'string'
        ? body.user_id.trim()
        : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const type =
    typeof body.type === 'string' && body.type.trim().length > 0 ? body.type.trim().toLowerCase() : 'info';
  const data = body.data ?? {};

  if (!title) {
    throw new Error('title is required.');
  }
  if (!message) {
    throw new Error('message is required.');
  }
  if (data !== null && typeof data !== 'object') {
    throw new Error('data must be an object.');
  }

  return {
    userId,
    title,
    message,
    type,
    data: data ?? {},
  };
}

function computeDurationHours(startTime, endTime) {
  if (!startTime || !endTime) {
    return null;
  }

  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  if (!Number.isFinite(diff) || diff <= 0) {
    return null;
  }

  return Number(diff.toFixed(1));
}

function mapParticipationStatus(participationStatus, activityStatus) {
  const activity = String(activityStatus ?? '').toLowerCase();
  if (activity === 'cancelled') {
    return 'cancelled';
  }
  if (activity === 'completed') {
    return 'completed';
  }

  const participation = String(participationStatus ?? '').toLowerCase();
  if (participation === 'cancelled' || participation === 'rejected') {
    return 'cancelled';
  }
  if (participation === 'checked_in') {
    return 'completed';
  }

  return 'upcoming';
}

function canWriteActivities(role) {
  return activityWriteRoles.has(String(role));
}

async function handleParticipationHistory(req, res) {
  const role = String(req.auth?.profile?.role ?? '');

  if (role !== 'volunteer' && role !== 'admin') {
    res.status(403).json({ message: 'Only volunteers can view participation history.' });
    return;
  }

  const requestedLimit = Number(req.query.limit ?? 50);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 200)
    : 50;

  try {
    const { data: participations, error } = await supabaseAdmin
      .from('activity_participations')
      .select('id, activity_id, status, created_at')
      .eq('volunteer_id', req.auth.user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      res.status(500).json({ message: error.message });
      return;
    }

    if (!participations || participations.length === 0) {
      res.json({ participations: [] });
      return;
    }

    const activityIds = Array.from(new Set(participations.map((row) => row.activity_id).filter(Boolean)));

    const { data: activities, error: activityError } = await supabaseAdmin
      .from('activities')
      .select('id, title, start_time, end_time, status, organizer_id')
      .in('id', activityIds)
      .is('deleted_at', null);

    if (activityError) {
      res.status(500).json({ message: activityError.message });
      return;
    }

    const activitiesById = new Map((activities ?? []).map((activity) => [activity.id, activity]));
    const organizerIds = Array.from(
      new Set((activities ?? []).map((activity) => activity.organizer_id).filter(Boolean))
    );

    let organizersById = new Map();
    if (organizerIds.length > 0) {
      const { data: organizers, error: organizerError } = await supabaseAdmin
        .from('users')
        .select('id, full_name')
        .in('id', organizerIds);

      if (organizerError) {
        res.status(500).json({ message: organizerError.message });
        return;
      }

      organizersById = new Map((organizers ?? []).map((user) => [user.id, user]));
    }

    const records = participations.map((participation) => {
      const activity = activitiesById.get(participation.activity_id);
      const organizer = activity ? organizersById.get(activity.organizer_id) : null;
      const status = mapParticipationStatus(participation.status, activity?.status);

      return {
        id: activity?.id ?? participation.activity_id ?? participation.id,
        participationId: participation.id,
        activityId: activity?.id ?? participation.activity_id,
        activityName: activity?.title ?? 'Untitled Activity',
        organization: organizer?.full_name ?? 'Organizer',
        date: activity?.start_time ?? participation.created_at ?? null,
        hours: status === 'cancelled' ? null : computeDurationHours(activity?.start_time, activity?.end_time),
        status,
      };
    });

    res.json({ participations: records });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load participation history.';
    res.status(500).json({ message });
  }
}

async function handleActivityDetail(req, res) {
  const activityId = req.params.id;

  const { data, error } = await supabaseAdmin
    .from('activities')
    .select(activityColumns)
    .eq('id', activityId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    res.status(500).json({ message: error.message });
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

async function requireAuth(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ message: 'Missing Bearer token.' });
    return;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ message: error?.message ?? 'Invalid access token.' });
    return;
  }

  try {
    const profile = await getProfileByUserId(data.user.id);
    req.auth = { token, user: data.user, profile };
    next();
  } catch (profileError) {
    const message = profileError instanceof Error ? profileError.message : 'Failed to load user profile.';
    res.status(500).json({ message });
  }
}

function requireAdmin(req, res, next) {
  const role = req.auth?.profile?.role;
  if (!role) {
    res.status(403).json({ message: 'Profile not found in public.users.' });
    return;
  }

  if (role !== 'admin') {
    res.status(403).json({ message: 'Admin role required.' });
    return;
  }

  next();
}

async function countRows(table, { filters = {}, excludeDeleted = false } = {}) {
  let query = supabaseAdmin.from(table).select('*', { head: true, count: 'exact' });
  if (excludeDeleted) {
    query = query.is('deleted_at', null);
  }

  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value);
  }

  const { count, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

async function getDistribution(table, key, excludeDeleted = false) {
  let query = supabaseAdmin.from(table).select(key);
  if (excludeDeleted) {
    query = query.is('deleted_at', null);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).reduce((acc, row) => {
    const value = typeof row[key] === 'string' && row[key].length > 0 ? row[key] : 'unknown';
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/auth/reset-password', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

  if (!email) {
    res.status(400).json({ message: 'email is required.' });
    return;
  }

  if (!isValidEmail(email)) {
    res.status(400).json({ message: 'email must be a valid email address.' });
    return;
  }

  try {
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: PASSWORD_RESET_REDIRECT_TO,
    });

    if (error) {
      const statusCode = Number.isInteger(error.status) ? error.status : 500;
      res.status(statusCode).json({ message: error.message });
      return;
    }

    res.json({
      success: true,
      message: 'If the email is registered, a password reset link has been sent.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send reset password email.';
    res.status(500).json({ message });
  }
});

app.get('/auth/me', requireAuth, (req, res) => {
  res.json({
    profile: req.auth.profile,
    auth: {
      id: req.auth.user.id,
      email: req.auth.user.email ?? null,
    },
  });
});

app.get('/profile/me', requireAuth, async (req, res) => {
  try {
    let volunteerProfile = null;
    if (req.auth?.profile?.role === 'volunteer') {
      volunteerProfile = await getVolunteerProfileByUserId(req.auth.user.id);
    }

    res.json({
      profile: req.auth.profile,
      volunteerProfile,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load profile.';
    res.status(500).json({ message });
  }
});

app.patch('/profile/me', requireAuth, async (req, res) => {
  const body = req.body ?? {};

  if (!isPlainObject(body)) {
    res.status(400).json({ message: 'Body must be a JSON object.' });
    return;
  }

  if (!req.auth?.profile) {
    res.status(404).json({ message: 'Profile not found in public.users.' });
    return;
  }

  const userUpdates = {};

  if (Object.hasOwn(body, 'fullName')) {
    if (typeof body.fullName !== 'string') {
      res.status(400).json({ message: 'fullName must be a string.' });
      return;
    }
    const fullName = body.fullName.trim();
    if (!fullName) {
      res.status(400).json({ message: 'fullName cannot be empty.' });
      return;
    }
    userUpdates.full_name = fullName;
  }

  if (Object.hasOwn(body, 'phone')) {
    if (typeof body.phone !== 'string') {
      res.status(400).json({ message: 'phone must be a string.' });
      return;
    }
    const phone = body.phone.trim();
    if (!phone) {
      res.status(400).json({ message: 'phone cannot be empty.' });
      return;
    }
    userUpdates.phone = phone;
  }

  if (Object.hasOwn(body, 'avatarUrl')) {
    const avatarUrl = body.avatarUrl;
    if (avatarUrl !== null && typeof avatarUrl !== 'string') {
      res.status(400).json({ message: 'avatarUrl must be a string or null.' });
      return;
    }

    if (typeof avatarUrl === 'string' && avatarUrl.trim().length > 0) {
      try {
        const parsed = new URL(avatarUrl.trim());
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          res.status(400).json({ message: 'avatarUrl must use http or https.' });
          return;
        }
      } catch {
        res.status(400).json({ message: 'avatarUrl is not a valid URL.' });
        return;
      }
      userUpdates.avatar_url = avatarUrl.trim();
    } else {
      userUpdates.avatar_url = null;
    }
  }

  const volunteerUpdates = {};

  if (Object.hasOwn(body, 'skills')) {
    try {
      volunteerUpdates.skills = normalizeStringArray(body.skills, 'skills');
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid skills.' });
      return;
    }
  }

  if (Object.hasOwn(body, 'interests')) {
    try {
      volunteerUpdates.interests = normalizeStringArray(body.interests, 'interests');
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid interests.' });
      return;
    }
  }

  if (Object.hasOwn(body, 'availability')) {
    const availability = body.availability;
    if (!isPlainObject(availability)) {
      res.status(400).json({ message: 'availability must be an object.' });
      return;
    }

    const availabilityKeys = ['weekdays', 'weekends', 'evenings'];
    for (const key of availabilityKeys) {
      if (!Object.hasOwn(availability, key) || typeof availability[key] !== 'boolean') {
        res.status(400).json({ message: `availability.${key} must be a boolean.` });
        return;
      }
    }

    volunteerUpdates.availability = {
      weekdays: availability.weekdays,
      weekends: availability.weekends,
      evenings: availability.evenings,
    };
  }

  const hasUserUpdates = Object.keys(userUpdates).length > 0;
  const hasVolunteerUpdates = Object.keys(volunteerUpdates).length > 0;

  if (!hasUserUpdates && !hasVolunteerUpdates) {
    res.status(400).json({ message: 'No valid fields to update.' });
    return;
  }

  if (hasVolunteerUpdates && req.auth.profile.role !== 'volunteer') {
    res.status(403).json({ message: 'Only volunteer profiles can update skills/interests/availability.' });
    return;
  }

  try {
    let profile = req.auth.profile;

    if (hasUserUpdates) {
      const { data, error } = await supabaseAdmin
        .from('users')
        .update({ ...userUpdates, updated_at: new Date().toISOString() })
        .eq('id', req.auth.user.id)
        .is('deleted_at', null)
        .select(userColumns)
        .maybeSingle();

      if (error) {
        res.status(500).json({ message: error.message });
        return;
      }

      if (!data) {
        res.status(404).json({ message: 'Profile not found.' });
        return;
      }

      profile = data;
    }

    let volunteerProfile = null;
    if (req.auth.profile.role === 'volunteer') {
      if (hasVolunteerUpdates) {
        const { data, error } = await supabaseAdmin
          .from('volunteer_profiles')
          .upsert(
            {
              user_id: req.auth.user.id,
              ...volunteerUpdates,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          )
          .select(volunteerColumns)
          .maybeSingle();

        if (error) {
          res.status(500).json({ message: error.message });
          return;
        }

        volunteerProfile = data ?? null;
      } else {
        volunteerProfile = await getVolunteerProfileByUserId(req.auth.user.id);
      }
    }

    res.json({
      profile,
      volunteerProfile,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update profile.';
    res.status(500).json({ message });
  }
});

app.get('/participations', requireAuth, handleParticipationHistory);
app.get('/participation-history', requireAuth, handleParticipationHistory);

app.get('/notifications', requireAuth, async (req, res) => {
  const requestedLimit = Number(req.query.limit ?? 50);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 200)
    : 50;
  const unreadOnly = String(req.query.unread ?? 'false').toLowerCase() === 'true';
  const role = String(req.auth?.profile?.role ?? '');
  const requestedUserId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
  const userId = role === 'admin' && requestedUserId ? requestedUserId : req.auth.user.id;

  try {
    let query = supabaseAdmin
      .from('notifications')
      .select(notificationColumns)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      query = query.is('read_at', null);
    }

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ message: error.message });
      return;
    }

    res.json({ notifications: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load notifications.';
    res.status(500).json({ message });
  }
});

app.post('/notifications', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '');
  const canCreate = role === 'admin' || role === 'organizer';
  if (!canCreate) {
    res.status(403).json({ message: 'Organizer or admin role required.' });
    return;
  }

  let payload;
  try {
    payload = normalizeNotificationPayload(req.body);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid payload.' });
    return;
  }

  const targetUserId = payload.userId || req.auth.user.id;
  if (!targetUserId) {
    res.status(400).json({ message: 'userId is required.' });
    return;
  }

  const now = new Date().toISOString();
  const insertPayload = {
    user_id: targetUserId,
    title: payload.title,
    message: payload.message,
    type: payload.type,
    data: payload.data,
    created_at: now,
  };

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .insert(insertPayload)
    .select(notificationColumns)
    .maybeSingle();

  if (error) {
    res.status(500).json({ message: error.message });
    return;
  }

  res.status(201).json({ notification: data });
});

app.get('/activities', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '');
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const mine = String(req.query.mine ?? 'false').toLowerCase() === 'true';
  const statusFilter =
    typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : 'all';
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

  if (mine) {
    if (role !== 'admin') {
      query = query.eq('organizer_id', req.auth.user.id);
    }
    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }
  } else if (role === 'volunteer') {
    query = query.eq('status', 'published');
  } else if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  } else {
    query = query.eq('status', 'published');
  }

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

app.get('/activities/:id', requireAuth, handleActivityDetail);
app.get('/activity/:id', requireAuth, handleActivityDetail);

app.post('/activities', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '');
  if (!canWriteActivities(role)) {
    res.status(403).json({ message: 'Organizer or admin role required.' });
    return;
  }

  let payload;
  try {
    payload = normalizeActivityPayload(req.body, { partial: false });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid payload.' });
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

app.patch('/activities/:id', requireAuth, async (req, res) => {
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

app.delete('/activities/:id', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '');
  if (!canWriteActivities(role)) {
    res.status(403).json({ message: 'Organizer or admin role required.' });
    return;
  }

  const activityId = req.params.id;

  const { data: existingActivity, error: existingError } = await supabaseAdmin
    .from('activities')
    .select('id, organizer_id')
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

  res.json({ success: true, message: 'Activity deleted successfully.' });
});

app.post('/auth/register-profile', requireAuth, async (req, res) => {
  const role = req.body?.role;
  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';

  if (!validRoles.has(role)) {
    res.status(400).json({ message: 'Invalid role.' });
    return;
  }
  if (role === 'admin' && req.auth?.profile?.role !== 'admin') {
    res.status(403).json({ message: 'You cannot self-assign admin role.' });
    return;
  }

  if (!fullName || !phone) {
    res.status(400).json({ message: 'fullName and phone are required.' });
    return;
  }

  const { error: upsertError } = await supabaseAdmin.from('users').upsert(
    {
      id: req.auth.user.id,
      role,
      full_name: fullName,
      phone,
      status: 'active',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (upsertError) {
    res.status(500).json({ message: upsertError.message });
    return;
  }

  if (role === 'volunteer') {
    const { error: volunteerError } = await supabaseAdmin.from('volunteer_profiles').upsert(
      {
        user_id: req.auth.user.id,
        skills: [],
        interests: [],
        availability: {
          weekdays: false,
          weekends: false,
          evenings: false,
        },
        total_hours: 0,
      },
      { onConflict: 'user_id' }
    );

    if (volunteerError) {
      res.status(500).json({ message: volunteerError.message });
      return;
    }
  }

  const profile = await getProfileByUserId(req.auth.user.id);
  res.json({ profile });
});

app.get('/admin/users', requireAuth, requireAdmin, async (req, res) => {
  const roleFilter = typeof req.query.role === 'string' ? req.query.role : 'all';
  const statusFilter = typeof req.query.status === 'string' ? req.query.status : 'all';
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

  if (roleFilter !== 'all' && !validRoles.has(roleFilter)) {
    res.status(400).json({ message: 'Invalid role filter.' });
    return;
  }

  let query = supabaseAdmin.from('users').select(userColumns).is('deleted_at', null).order('created_at', {
    ascending: false,
  });

  if (roleFilter !== 'all') {
    query = query.eq('role', roleFilter);
  }
  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;
  if (error) {
    res.status(500).json({ message: error.message });
    return;
  }

  const users = (data ?? []).filter((user) => {
    if (!search) {
      return true;
    }

    return (
      String(user.id).toLowerCase().includes(search) ||
      String(user.full_name ?? '').toLowerCase().includes(search) ||
      String(user.phone ?? '').toLowerCase().includes(search)
    );
  });

  res.json({ users });
});

app.patch('/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const targetUserId = req.params.id;
  const nextRole = req.body?.role;
  const nextStatus = typeof req.body?.status === 'string' ? req.body.status.trim().toLowerCase() : undefined;

  if (nextRole && !validRoles.has(nextRole)) {
    res.status(400).json({ message: 'Invalid role value.' });
    return;
  }
  if (!nextRole && !nextStatus) {
    res.status(400).json({ message: 'At least one field is required: role or status.' });
    return;
  }

  if (targetUserId === req.auth.user.id && nextRole && nextRole !== 'admin') {
    res.status(400).json({ message: 'You cannot downgrade your own admin role.' });
    return;
  }

  const updates = {
    ...(nextRole ? { role: nextRole } : {}),
    ...(nextStatus ? { status: nextStatus } : {}),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('users')
    .update(updates)
    .eq('id', targetUserId)
    .is('deleted_at', null)
    .select(userColumns)
    .maybeSingle();

  if (error) {
    if (error.code === '23514' || error.code === '22P02') {
      res.status(400).json({ message: `Invalid role or status value: ${error.message}` });
      return;
    }
    res.status(500).json({ message: error.message });
    return;
  }

  if (!data) {
    res.status(404).json({ message: 'User not found.' });
    return;
  }

  res.json({ user: data });
});

app.delete('/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const targetUserId = req.params.id;

  if (!targetUserId) {
    res.status(400).json({ message: 'User id is required.' });
    return;
  }

  if (targetUserId === req.auth.user.id) {
    res.status(400).json({ message: 'You cannot delete your own account.' });
    return;
  }

  try {
    const { data: existingUser, error: existingError } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('id', targetUserId)
      .maybeSingle();

    if (existingError) {
      res.status(500).json({ message: existingError.message });
      return;
    }

    if (!existingUser) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }

    const { data: activities, error: activitiesError } = await supabaseAdmin
      .from('activities')
      .select('id')
      .eq('organizer_id', targetUserId)
      .is('deleted_at', null);

    if (activitiesError) {
      res.status(500).json({ message: activitiesError.message });
      return;
    }

    const activityIds = (activities ?? []).map((activity) => activity.id);
    let participationIds = [];

    if (activityIds.length > 0) {
      const { data: participationsForActivities, error: participationsError } = await supabaseAdmin
        .from('activity_participations')
        .select('id')
        .in('activity_id', activityIds);

      if (participationsError) {
        res.status(500).json({ message: participationsError.message });
        return;
      }

      participationIds = (participationsForActivities ?? []).map((item) => item.id);
    }

    if (participationIds.length > 0) {
      const { error: feedbackByParticipationError } = await supabaseAdmin
        .from('participation_feedback')
        .delete()
        .in('participation_id', participationIds);

      if (feedbackByParticipationError) {
        res.status(500).json({ message: feedbackByParticipationError.message });
        return;
      }
    }

    const { error: feedbackByUserError } = await supabaseAdmin
      .from('participation_feedback')
      .delete()
      .or(`volunteer_id.eq.${targetUserId},organizer_id.eq.${targetUserId}`);

    if (feedbackByUserError) {
      res.status(500).json({ message: feedbackByUserError.message });
      return;
    }

    if (activityIds.length > 0) {
      const { error: participationDeleteError } = await supabaseAdmin
        .from('activity_participations')
        .delete()
        .in('activity_id', activityIds);

      if (participationDeleteError) {
        res.status(500).json({ message: participationDeleteError.message });
        return;
      }

      const { error: reportDeleteError } = await supabaseAdmin
        .from('activity_reports')
        .delete()
        .in('activity_id', activityIds);

      if (reportDeleteError) {
        res.status(500).json({ message: reportDeleteError.message });
        return;
      }
    }

    const { error: participationByVolunteerError } = await supabaseAdmin
      .from('activity_participations')
      .delete()
      .eq('volunteer_id', targetUserId);

    if (participationByVolunteerError) {
      res.status(500).json({ message: participationByVolunteerError.message });
      return;
    }

    if (activityIds.length > 0) {
      const { error: activitiesDeleteError } = await supabaseAdmin
        .from('activities')
        .delete()
        .in('id', activityIds);

      if (activitiesDeleteError) {
        res.status(500).json({ message: activitiesDeleteError.message });
        return;
      }
    }

    const { error: volunteerProfileDeleteError } = await supabaseAdmin
      .from('volunteer_profiles')
      .delete()
      .eq('user_id', targetUserId);

    if (volunteerProfileDeleteError) {
      res.status(500).json({ message: volunteerProfileDeleteError.message });
      return;
    }

    const { error: publicUserDeleteError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', targetUserId);

    if (publicUserDeleteError) {
      res.status(500).json({ message: publicUserDeleteError.message });
      return;
    }

    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
    if (authDeleteError) {
      res.status(500).json({ message: authDeleteError.message });
      return;
    }

    res.json({ success: true, userId: targetUserId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete user.';
    res.status(500).json({ message });
  }
});

app.get('/admin/dashboard', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [
      totalUsers,
      activeUsers,
      totalActivities,
      publishedActivities,
      completedActivities,
      totalParticipations,
      checkedInParticipations,
      totalReports,
      usersByRole,
      activitiesByStatus,
      participationsByStatus,
    ] = await Promise.all([
      countRows('users', { excludeDeleted: true }),
      countRows('users', { filters: { status: 'active' }, excludeDeleted: true }),
      countRows('activities', { excludeDeleted: true }),
      countRows('activities', { filters: { status: 'published' }, excludeDeleted: true }),
      countRows('activities', { filters: { status: 'completed' }, excludeDeleted: true }),
      countRows('activity_participations'),
      countRows('activity_participations', { filters: { status: 'checked_in' } }),
      countRows('activity_reports'),
      getDistribution('users', 'role', true),
      getDistribution('activities', 'status', true),
      getDistribution('activity_participations', 'status', false),
    ]);

    res.json({
      totalUsers,
      activeUsers,
      totalActivities,
      publishedActivities,
      completedActivities,
      totalParticipations,
      checkedInParticipations,
      totalReports,
      usersByRole,
      activitiesByStatus,
      participationsByStatus,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load dashboard metrics.';
    res.status(500).json({ message });
  }
});

app.use((_req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    res.status(400).json({ message: 'Malformed JSON body.' });
    return;
  }

  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  res.status(500).json({ message });
});

export default app;
