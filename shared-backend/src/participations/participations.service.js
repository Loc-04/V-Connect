import { supabaseAdmin } from '../database/supabase.js';
import { computeDurationHours, mapParticipationStatus } from '../activities/activities.service.js';

async function attachVolunteerSummaries(participations) {
  if (!Array.isArray(participations) || participations.length === 0) {
    return [];
  }

  const volunteerIds = Array.from(
    new Set(
      participations
        .map((row) => (typeof row.volunteer_id === 'string' ? row.volunteer_id : ''))
        .filter((id) => id.length > 0)
    )
  );

  if (volunteerIds.length === 0) {
    return participations.map((row) => ({ ...row, volunteer: null }));
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, full_name, phone, avatar_url, role')
    .in('id', volunteerIds);

  if (error) {
    throw new Error(error.message);
  }

  const byId = new Map((data ?? []).map((user) => [user.id, user]));

  return participations.map((row) => ({
    ...row,
    volunteer: byId.get(row.volunteer_id) ?? null,
  }));
}

async function attachActivitySummaries(participations) {
  if (!Array.isArray(participations) || participations.length === 0) {
    return [];
  }

  const activityIds = Array.from(
    new Set(
      participations
        .map((row) => (typeof row.activity_id === 'string' ? row.activity_id : ''))
        .filter((id) => id.length > 0)
    )
  );

  if (activityIds.length === 0) {
    return participations.map((row) => ({
      ...row,
      activityId: null,
      activityName: 'Untitled Activity',
      organization: 'Organizer',
      date: row.created_at ?? null,
      hours: null,
    }));
  }

  const { data: activities, error: activitiesError } = await supabaseAdmin
    .from('activities')
    .select('id, title, start_time, end_time, organizer_id')
    .in('id', activityIds);

  if (activitiesError) {
    throw new Error(activitiesError.message);
  }

  const activityById = new Map((activities ?? []).map((activity) => [activity.id, activity]));
  const organizerIds = Array.from(
    new Set(
      (activities ?? [])
        .map((activity) => activity.organizer_id)
        .filter((id) => typeof id === 'string' && id.length > 0)
    )
  );

  let organizerById = new Map();
  if (organizerIds.length > 0) {
    const { data: organizers, error: organizersError } = await supabaseAdmin
      .from('users')
      .select('id, full_name')
      .in('id', organizerIds);

    if (organizersError) {
      throw new Error(organizersError.message);
    }

    organizerById = new Map((organizers ?? []).map((user) => [user.id, user]));
  }

  return participations.map((row) => {
    const activity = activityById.get(row.activity_id);
    const organizer = activity ? organizerById.get(activity.organizer_id) : null;

    return {
      ...row,
      activityId: activity?.id ?? row.activity_id ?? null,
      activityName: activity?.title ?? 'Untitled Activity',
      organization: organizer?.full_name ?? 'Organizer',
      date: activity?.start_time ?? row.created_at ?? null,
      hours: computeDurationHours(activity?.start_time, activity?.end_time),
    };
  });
}

async function getParticipationHistoryForUser({ userId, role, limit = 50 }) {
  if (role !== 'volunteer' && role !== 'admin') {
    const error = new Error('Only volunteers can view participation history.');
    error.statusCode = 403;
    throw error;
  }

  const { data: participations, error } = await supabaseAdmin
    .from('activity_participations')
    .select('id, activity_id, status, created_at')
    .eq('volunteer_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  if (!participations || participations.length === 0) {
    return [];
  }

  const activityIds = Array.from(new Set(participations.map((row) => row.activity_id).filter(Boolean)));

  const { data: activities, error: activityError } = await supabaseAdmin
    .from('activities')
    .select('id, title, start_time, end_time, status, organizer_id')
    .in('id', activityIds)
    .is('deleted_at', null);

  if (activityError) {
    throw new Error(activityError.message);
  }

  const activitiesById = new Map((activities ?? []).map((activity) => [activity.id, activity]));
  const organizerIds = Array.from(new Set((activities ?? []).map((activity) => activity.organizer_id).filter(Boolean)));

  let organizersById = new Map();
  if (organizerIds.length > 0) {
    const { data: organizers, error: organizerError } = await supabaseAdmin
      .from('users')
      .select('id, full_name')
      .in('id', organizerIds);

    if (organizerError) {
      throw new Error(organizerError.message);
    }

    organizersById = new Map((organizers ?? []).map((user) => [user.id, user]));
  }

  return participations.map((participation) => {
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
}

export { attachVolunteerSummaries, attachActivitySummaries, getParticipationHistoryForUser };
