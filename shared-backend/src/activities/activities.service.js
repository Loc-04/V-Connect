import { activityColumns, activityWriteRoles } from '../config/constants.js';
import { supabaseAdmin } from '../database/supabase.js';
import { withResolvedActivityCoverImage } from './activities.cover.js';

const publicActivityColumns = 'id, title, description, cover_image_url, location, start_time, end_time, capacity, required_skills, status, organizer_id';
const publicParticipationStatuses = ['assigned', 'pending', 'approved', 'checked_in'];

async function getActivityById(activityId) {
  const { data, error } = await supabaseAdmin
    .from('activities')
    .select(activityColumns)
    .eq('id', activityId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return withResolvedActivityCoverImage(data);
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

function mapParticipationStatus(participationStatus, activityStatus, activityEndTime = null) {
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

  if (activityEndTime) {
    const endTime = new Date(activityEndTime);
    if (!Number.isNaN(endTime.getTime()) && endTime.getTime() <= Date.now()) {
      return 'expired';
    }
  }

  return 'upcoming';
}

function canWriteActivities(role) {
  return activityWriteRoles.has(String(role));
}

async function listPublishedActivitiesForGuest(limit = 120) {
  const { data, error } = await supabaseAdmin
    .from('activities')
    .select(publicActivityColumns)
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('start_time', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) ? data.map((row) => withResolvedActivityCoverImage(row)) : [];
}

async function getPublishedActivityForGuestById(activityId) {
  const { data, error } = await supabaseAdmin
    .from('activities')
    .select(publicActivityColumns)
    .eq('id', activityId)
    .eq('status', 'published')
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? withResolvedActivityCoverImage(data) : null;
}

async function getOrganizerPublicProfilesByIds(organizerIds) {
  const uniqueOrganizerIds = Array.from(new Set((organizerIds ?? []).filter(Boolean)));
  if (uniqueOrganizerIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, full_name, avatar_url')
    .in('id', uniqueOrganizerIds)
    .is('deleted_at', null);

  if (error) {
    throw new Error(error.message);
  }

  return new Map((data ?? []).map((row) => [row.id, row]));
}

async function getActiveParticipationCountsByActivityIds(activityIds) {
  const uniqueActivityIds = Array.from(new Set((activityIds ?? []).filter(Boolean)));
  if (uniqueActivityIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabaseAdmin
    .from('activity_participations')
    .select('activity_id, status')
    .in('activity_id', uniqueActivityIds)
    .in('status', publicParticipationStatuses);

  if (error) {
    throw new Error(error.message);
  }

  const countsByActivityId = new Map();
  for (const row of data ?? []) {
    const activityId = row.activity_id;
    if (!activityId) {
      continue;
    }
    countsByActivityId.set(activityId, (countsByActivityId.get(activityId) ?? 0) + 1);
  }

  return countsByActivityId;
}

export {
  getActivityById,
  computeDurationHours,
  mapParticipationStatus,
  canWriteActivities,
  listPublishedActivitiesForGuest,
  getPublishedActivityForGuestById,
  getOrganizerPublicProfilesByIds,
  getActiveParticipationCountsByActivityIds,
};
