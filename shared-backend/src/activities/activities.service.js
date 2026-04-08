import { activityColumns, activityWriteRoles } from '../config/constants.js';
import { supabaseAdmin } from '../database/supabase.js';

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

  return data ?? null;
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

export { getActivityById, computeDurationHours, mapParticipationStatus, canWriteActivities };
