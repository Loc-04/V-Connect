import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
const validRoles = new Set(['admin', 'organizer', 'volunteer']);

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
