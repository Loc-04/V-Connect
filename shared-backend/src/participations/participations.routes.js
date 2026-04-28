import { Router } from 'express';
import { participationColumns, validParticipationStatuses } from '../config/constants.js';
import { isUuid } from '../common/utils/validators.js';
import { supabaseAdmin } from '../database/supabase.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { getActivityById } from '../activities/activities.service.js';
import { normalizeParticipationCreatePayload } from './participations.validation.js';
import { getProfileByUserId } from '../users/users.service.js';
import {
  attachActivitySummaries,
  attachVolunteerSummaries,
  getParticipationHistoryForUser,
} from './participations.service.js';
import { recommend as aiRecommend } from '../ai/ai.router.js';
import { createNotificationRecord } from '../notifications/notifications.service.js';
import { tryLogRecommendationInteraction } from '../recommendations/recommendation.logging.js';
import {
  generateCheckInCode,
  isSameCalendarDate,
  normalizeCheckInCode,
  toLocalDateKey,
} from './checkin-code.js';

const router = Router();

function asUuidOrNull(value) {
  const raw = String(value ?? '').trim();
  return isUuid(raw) ? raw : null;
}

async function enrichParticipation(participation) {
  if (!participation) {
    return null;
  }

  const [withVolunteer] = await attachVolunteerSummaries([participation]);
  const [withActivity] = await attachActivitySummaries([withVolunteer ?? participation]);
  return withActivity ?? withVolunteer ?? participation;
}

async function getParticipationRecord(participationId) {
  const { data, error } = await supabaseAdmin
    .from('activity_participations')
    .select(participationColumns)
    .eq('id', participationId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}

async function tryCreateNotification(payload) {
  try {
    await createNotificationRecord(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Notification create failed: ${message}`);
  }
}

async function getUserDisplayName(userId, fallback = 'A volunteer') {
  try {
    const profile = await getProfileByUserId(userId);
    const fullName = String(profile?.full_name ?? '').trim();
    return fullName || fallback;
  } catch {
    return fallback;
  }
}

function createCheckInDateLockedError(activity) {
  const eventDateLabel = toLocalDateKey(activity?.start_time);
  const message = eventDateLabel
    ? `Check-in opens only on the event start date (${eventDateLabel}).`
    : 'Check-in opens only on the event start date.';
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function parseAndValidateCheckInCode(rawCode) {
  const normalized = normalizeCheckInCode(rawCode);
  if (!normalized) {
    const error = new Error('checkInCode is required.');
    error.statusCode = 400;
    throw error;
  }
  if (!/^\d{5}$/.test(normalized)) {
    const error = new Error('checkInCode must be exactly 5 digits.');
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

async function getActiveRegistrationCount(activityId, excludeParticipationId = null) {
  let query = supabaseAdmin
    .from('activity_participations')
    .select('*', { head: true, count: 'exact' })
    .eq('activity_id', activityId)
    .in('status', ['assigned', 'pending', 'approved', 'checked_in']);

  if (excludeParticipationId) {
    query = query.neq('id', excludeParticipationId);
  }

  const { count, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

async function assertActivityAccessForOrganizerOrAdmin(activityId, auth) {
  const activity = await getActivityById(activityId);
  if (!activity) {
    const error = new Error('Activity not found.');
    error.statusCode = 404;
    throw error;
  }

  if (auth.profile?.role !== 'admin' && activity.organizer_id !== auth.user.id) {
    const error = new Error('You can access registrations only for your own activities.');
    error.statusCode = 403;
    throw error;
  }

  return activity;
}

async function getRegistrationWithActivityForAccess(participationId, auth, { allowVolunteerOwner = false } = {}) {
  const participation = await getParticipationRecord(participationId);
  if (!participation) {
    const error = new Error('Registration not found.');
    error.statusCode = 404;
    throw error;
  }

  const activity = await getActivityById(participation.activity_id);
  if (!activity) {
    const error = new Error('Activity not found for this registration.');
    error.statusCode = 404;
    throw error;
  }

  const role = String(auth.profile?.role ?? '');
  const isAdmin = role === 'admin';
  const isOwnerOrganizer = activity.organizer_id === auth.user.id;
  const isVolunteerOwner = participation.volunteer_id === auth.user.id;

  if (!isAdmin && !isOwnerOrganizer && !(allowVolunteerOwner && isVolunteerOwner)) {
    const error = new Error('You do not have access to this registration.');
    error.statusCode = 403;
    throw error;
  }

  return { participation, activity };
}

async function computeRegistrationMatchRatio(activity, volunteerId) {
  try {
    const result = await aiRecommend({
      scope: 'match',
      activity,
      volunteerId,
    });
    return typeof result.matchRatio === 'number' ? result.matchRatio : null;
  } catch {
    return null;
  }
}

async function createRegistration({ activityId, volunteerId, requesterRole, recommendationItemId = null }) {
  const activity = await getActivityById(activityId);
  if (!activity) {
    const error = new Error('Activity not found.');
    error.statusCode = 404;
    throw error;
  }

  if (requesterRole !== 'admin' && activity.status !== 'published') {
    const error = new Error('You can register only for published activities.');
    error.statusCode = 403;
    throw error;
  }

  const activityEndTime = new Date(activity.end_time ?? '');
  if (requesterRole !== 'admin' && !Number.isNaN(activityEndTime.getTime()) && activityEndTime.getTime() <= Date.now()) {
    const error = new Error('Registration is closed because this activity has already ended.');
    error.statusCode = 400;
    throw error;
  }

  const { data: existingRegistration, error: existingError } = await supabaseAdmin
    .from('activity_participations')
    .select(participationColumns)
    .eq('activity_id', activityId)
    .eq('volunteer_id', volunteerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existingRegistration && ['assigned', 'pending', 'approved', 'checked_in'].includes(String(existingRegistration.status ?? ''))) {
    return {
      registration: await enrichParticipation(existingRegistration),
      created: false,
      message: 'You already registered for this activity.',
    };
  }

  if (requesterRole !== 'admin') {
    const { data: otherCommitted, error: otherCommittedError } = await supabaseAdmin
      .from('activity_participations')
      .select('id, activity_id')
      .eq('volunteer_id', volunteerId)
      .eq('status', 'approved')
      .neq('activity_id', activityId);

    if (otherCommittedError) {
      throw new Error(otherCommittedError.message);
    }

    const committedActivityIds = Array.from(
      new Set(
        (otherCommitted ?? [])
          .map((row) => (typeof row.activity_id === 'string' ? row.activity_id : ''))
          .filter((id) => id.length > 0)
      )
    );

    if (committedActivityIds.length > 0) {
      const { data: conflictingActivities, error: conflictingActivitiesError } = await supabaseAdmin
        .from('activities')
        .select('id')
        .in('id', committedActivityIds)
        .is('deleted_at', null)
        .gt('end_time', new Date().toISOString())
        .neq('status', 'completed')
        .neq('status', 'cancelled');

      if (conflictingActivitiesError) {
        throw new Error(conflictingActivitiesError.message);
      }

      if ((conflictingActivities ?? []).length > 0) {
        const error = new Error(
          'You already have an approved registration for another activity. Approved registrations must be handled by the organizer before you can sign up elsewhere.',
        );
        error.statusCode = 400;
        throw error;
      }
    }
  }

  const activeCount = await getActiveRegistrationCount(activityId, existingRegistration?.id ?? null);
  if ((activeCount ?? 0) >= Number(activity.capacity ?? 0)) {
    const error = new Error('Activity is full.');
    error.statusCode = 400;
    throw error;
  }

  const matchRatio = await computeRegistrationMatchRatio(activity, volunteerId);
  const now = new Date().toISOString();
  const normalizedRecommendationItemId = asUuidOrNull(recommendationItemId);
  const registrationSource = normalizedRecommendationItemId ? 'recommendation' : 'direct';

  let data;
  if (existingRegistration) {
    const updatePayload = {
      status: 'pending',
      ai_match_score: matchRatio,
      recommendation_item_id: normalizedRecommendationItemId,
      registration_source: registrationSource,
      checked_in_at: null,
      updated_at: now,
    };

    const updateResult = await supabaseAdmin
      .from('activity_participations')
      .update(updatePayload)
      .eq('id', existingRegistration.id)
      .select(participationColumns)
      .maybeSingle();

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }

    data = updateResult.data;
  } else {
    const insertResult = await supabaseAdmin
      .from('activity_participations')
      .insert({
        activity_id: activityId,
        volunteer_id: volunteerId,
        status: 'pending',
        ai_match_score: matchRatio,
        recommendation_item_id: normalizedRecommendationItemId,
        registration_source: registrationSource,
        updated_at: now,
      })
      .select(participationColumns)
      .maybeSingle();

    if (insertResult.error) {
      throw new Error(insertResult.error.message);
    }

    data = insertResult.data;
  }

  await tryCreateNotification({
    userId: volunteerId,
    title: 'Registration Submitted',
    message: `Your registration for "${activity.title}" is now pending review.`,
    type: 'opportunity',
    data: {
      activityId: activity.id,
      registrationId: data?.id ?? null,
      status: 'pending',
    },
  });

  if (activity.organizer_id && activity.organizer_id !== volunteerId) {
    const volunteerName = await getUserDisplayName(volunteerId);
    await tryCreateNotification({
      userId: activity.organizer_id,
      title: 'New Registration Received',
      message: `${volunteerName} registered for "${activity.title}".`,
      type: 'message',
      data: {
        activityId: activity.id,
        registrationId: data?.id ?? null,
        volunteerId,
        status: 'pending',
      },
    });
  }

  await tryLogRecommendationInteraction(
    {
      event_type: 'register',
      serving_item_id: normalizedRecommendationItemId,
      actor_user_id: volunteerId,
      activity_id: activityId,
      volunteer_id: volunteerId,
      participation_id: data?.id ?? existingRegistration?.id ?? null,
      source_surface: 'web',
      metadata: {
        registration_source: registrationSource,
      },
    },
    'participations.register'
  );

  return {
    registration: await enrichParticipation(data),
    created: true,
    message: existingRegistration ? 'Registration reopened and set to pending.' : 'Registration created successfully.',
  };
}

async function cancelRegistration({ activityId, volunteerId }) {
  const { data: existingRegistration, error: existingError } = await supabaseAdmin
    .from('activity_participations')
    .select(participationColumns)
    .eq('activity_id', activityId)
    .eq('volunteer_id', volunteerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (!existingRegistration) {
    const error = new Error('Registration not found for this activity.');
    error.statusCode = 404;
    throw error;
  }

  if (String(existingRegistration.status ?? '') === 'checked_in') {
    const error = new Error('Checked-in registration cannot be cancelled.');
    error.statusCode = 400;
    throw error;
  }

  if (String(existingRegistration.status ?? '') === 'approved') {
    const error = new Error('Approved registration cannot be cancelled by the volunteer.');
    error.statusCode = 400;
    throw error;
  }

  if (String(existingRegistration.status ?? '') === 'cancelled') {
    return {
      registration: await enrichParticipation(existingRegistration),
      message: 'Registration already cancelled.',
    };
  }

  const { data, error } = await supabaseAdmin
    .from('activity_participations')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', existingRegistration.id)
    .select(participationColumns)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  let activity = null;
  try {
    activity = await getActivityById(activityId);
  } catch {
    activity = null;
  }

  await tryCreateNotification({
    userId: volunteerId,
    title: 'Registration Cancelled',
    message: activity
      ? `Your registration for "${activity.title}" has been cancelled.`
      : 'Your registration has been cancelled.',
    type: 'message',
    data: {
      activityId,
      registrationId: data?.id ?? null,
      status: 'cancelled',
    },
  });

  if (activity?.organizer_id && activity.organizer_id !== volunteerId) {
    const volunteerName = await getUserDisplayName(volunteerId);
    await tryCreateNotification({
      userId: activity.organizer_id,
      title: 'Registration Cancelled',
      message: `${volunteerName} cancelled registration for "${activity.title}".`,
      type: 'message',
      data: {
        activityId,
        registrationId: data?.id ?? null,
        volunteerId,
        status: 'cancelled',
      },
    });
  }

  await tryLogRecommendationInteraction(
    {
      event_type: 'cancelled',
      serving_item_id: data?.recommendation_item_id ?? existingRegistration?.recommendation_item_id ?? null,
      actor_user_id: volunteerId,
      activity_id: activityId,
      volunteer_id: volunteerId,
      participation_id: data?.id ?? existingRegistration?.id ?? null,
      source_surface: 'web',
    },
    'participations.cancel'
  );

  return {
    registration: await enrichParticipation(data),
    message: 'Registration cancelled successfully.',
  };
}

async function updateRegistrationStatus({ participationId, nextStatus, auth }) {
  const { participation, activity } = await getRegistrationWithActivityForAccess(participationId, auth);

  const currentStatus = String(participation.status ?? '');
  if (currentStatus === 'checked_in') {
    const error = new Error('Checked-in registration cannot be changed.');
    error.statusCode = 400;
    throw error;
  }

  if (currentStatus === 'cancelled') {
    const error = new Error('Cancelled registration cannot be changed.');
    error.statusCode = 400;
    throw error;
  }

  if (currentStatus === nextStatus) {
    return {
      registration: await enrichParticipation(participation),
      message: `Registration already ${nextStatus}.`,
    };
  }

  if (nextStatus === 'approved') {
    const activeCount = await getActiveRegistrationCount(activity.id, participation.id);
    if ((activeCount ?? 0) >= Number(activity.capacity ?? 0)) {
      const error = new Error('Activity is full. Cannot approve more registrations.');
      error.statusCode = 400;
      throw error;
    }
  }

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('activity_participations')
    .update({
      status: nextStatus,
      updated_at: now,
    })
    .eq('id', participation.id)
    .select(participationColumns)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const checkInCode = nextStatus === 'approved' ? generateCheckInCode(participation.id) : null;
  const notificationTitle = nextStatus === 'approved' ? 'Registration Approved' : 'Registration Rejected';
  const notificationMessage =
    nextStatus === 'approved'
      ? `Your registration for "${activity.title}" has been approved. Your check-in code is ${checkInCode}.`
      : `Your registration for "${activity.title}" has been rejected.`;
  const volunteerName = await getUserDisplayName(participation.volunteer_id);

  await tryCreateNotification({
    userId: participation.volunteer_id,
    title: notificationTitle,
    message: notificationMessage,
    type: 'approval',
    data: {
      activityId: activity.id,
      registrationId: participation.id,
      status: nextStatus,
      checkInCode,
    },
  });

  if (activity.organizer_id) {
    await tryCreateNotification({
      userId: activity.organizer_id,
      title: notificationTitle,
      message:
        nextStatus === 'approved'
          ? `${volunteerName} was approved for "${activity.title}".`
          : `${volunteerName} was rejected for "${activity.title}".`,
      type: 'approval',
      data: {
        activityId: activity.id,
        registrationId: participation.id,
        volunteerId: participation.volunteer_id,
        status: nextStatus,
        checkInCode,
      },
    });
  }

  await tryLogRecommendationInteraction(
    {
      event_type: nextStatus,
      serving_item_id: data?.recommendation_item_id ?? participation?.recommendation_item_id ?? null,
      actor_user_id: auth.user.id,
      activity_id: data?.activity_id ?? participation.activity_id,
      volunteer_id: data?.volunteer_id ?? participation.volunteer_id,
      participation_id: data?.id ?? participation.id,
      source_surface: 'web',
    },
    'participations.status'
  );

  return {
    registration: await enrichParticipation(data),
    message: `Registration ${nextStatus} successfully.`,
  };
}

async function performCheckIn({ participation, activity, actorUserId = null }) {
  if (!isSameCalendarDate(activity?.start_time)) {
    throw createCheckInDateLockedError(activity);
  }

  if (participation.status === 'checked_in') {
    const error = new Error('Participant already checked in.');
    error.statusCode = 400;
    throw error;
  }

  if (participation.status === 'rejected') {
    const error = new Error('Rejected participation cannot be checked in.');
    error.statusCode = 400;
    throw error;
  }

  if (participation.status !== 'approved') {
    const error = new Error('Only approved participations can be checked in.');
    error.statusCode = 400;
    throw error;
  }

  const now = new Date().toISOString();
  let updatePayload = {
    status: 'checked_in',
    checked_in_at: now,
    updated_at: now,
  };

  let updateResult = await supabaseAdmin
    .from('activity_participations')
    .update(updatePayload)
    .eq('id', participation.id)
    .select(participationColumns)
    .maybeSingle();

  if (updateResult.error?.code === '42703') {
    updatePayload = {
      status: 'checked_in',
      updated_at: now,
    };
    updateResult = await supabaseAdmin
      .from('activity_participations')
      .update(updatePayload)
      .eq('id', participation.id)
      .select(participationColumns)
      .maybeSingle();
  }

  const { data, error } = updateResult;
  if (error) {
    if (error.code === '23514' || error.code === '22P02' || error.code === '23502' || error.code === '23503') {
      const validationError = new Error(error.message);
      validationError.statusCode = 400;
      throw validationError;
    }
    throw new Error(error.message);
  }

  if (!data) {
    const notFoundError = new Error('Participation not found.');
    notFoundError.statusCode = 404;
    throw notFoundError;
  }

  const updatedParticipation = await enrichParticipation(data);
  await tryCreateNotification({
    userId: participation.volunteer_id,
    title: 'Check-in Confirmed',
    message: `Your attendance for "${activity.title}" has been checked in successfully.`,
    type: 'message',
    data: {
      activityId: activity.id,
      registrationId: participation.id,
      status: 'checked_in',
    },
  });

  if (activity.organizer_id) {
    const volunteerName = await getUserDisplayName(participation.volunteer_id);
    await tryCreateNotification({
      userId: activity.organizer_id,
      title: 'Check-in Recorded',
      message: `${volunteerName} was checked in for "${activity.title}".`,
      type: 'message',
      data: {
        activityId: activity.id,
        registrationId: participation.id,
        volunteerId: participation.volunteer_id,
        status: 'checked_in',
      },
    });
  }

  await tryLogRecommendationInteraction(
    {
      event_type: 'checked_in',
      serving_item_id: data?.recommendation_item_id ?? participation?.recommendation_item_id ?? null,
      actor_user_id: actorUserId,
      activity_id: data?.activity_id ?? participation.activity_id,
      volunteer_id: data?.volunteer_id ?? participation.volunteer_id,
      participation_id: data?.id ?? participation.id,
      source_surface: 'web',
    },
    'participations.checkin'
  );

  return { participation: updatedParticipation ?? data };
}

router.get('/participation-history', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '');
  const requestedLimit = Number(req.query.limit ?? 50);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 200)
    : 50;

  try {
    const participations = await getParticipationHistoryForUser({
      userId: req.auth.user.id,
      role,
      limit,
    });
    res.json({ participations });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load participation history.';
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 500;
    res.status(statusCode).json({ message });
  }
});

router.get('/activities/:id/registrations', requireAuth, async (req, res) => {
  const activityId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!isUuid(activityId)) {
    res.status(400).json({ message: 'Activity id must be a valid UUID.' });
    return;
  }

  const role = String(req.auth?.profile?.role ?? '');
  if (role !== 'organizer' && role !== 'admin') {
    res.status(403).json({ message: 'Organizer or admin role required.' });
    return;
  }

  try {
    await assertActivityAccessForOrganizerOrAdmin(activityId, req.auth);

    const { data, error } = await supabaseAdmin
      .from('activity_participations')
      .select(participationColumns)
      .eq('activity_id', activityId)
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ message: error.message });
      return;
    }

    const withVolunteers = await attachVolunteerSummaries(data ?? []);
    const registrations = await attachActivitySummaries(withVolunteers);
    res.json({ registrations });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load registrations.';
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 500;
    res.status(statusCode).json({ message });
  }
});

router.post('/activities/:id/register', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '');
  if (role !== 'volunteer' && role !== 'admin') {
    res.status(403).json({ message: 'Only volunteers/admin can register for activities.' });
    return;
  }

  const activityId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!isUuid(activityId)) {
    res.status(400).json({ message: 'Activity id must be a valid UUID.' });
    return;
  }

  try {
    const result = await createRegistration({
      activityId,
      volunteerId: req.auth.user.id,
      requesterRole: role,
      recommendationItemId: req.body?.recommendation_item_id,
    });
    res.status(result.created ? 201 : 200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create registration.';
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 500;
    res.status(statusCode).json({ message });
  }
});

router.delete('/activities/:id/register', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '');
  if (role !== 'volunteer' && role !== 'admin') {
    res.status(403).json({ message: 'Only volunteers/admin can cancel registrations.' });
    return;
  }

  const activityId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!isUuid(activityId)) {
    res.status(400).json({ message: 'Activity id must be a valid UUID.' });
    return;
  }

  try {
    const result = await cancelRegistration({
      activityId,
      volunteerId: req.auth.user.id,
    });
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to cancel registration.';
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 500;
    res.status(statusCode).json({ message });
  }
});

router.get('/registrations/:id', requireAuth, async (req, res) => {
  const participationId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!isUuid(participationId)) {
    res.status(400).json({ message: 'Registration id must be a valid UUID.' });
    return;
  }

  try {
    const { participation } = await getRegistrationWithActivityForAccess(participationId, req.auth, {
      allowVolunteerOwner: true,
    });

    res.json({ registration: await enrichParticipation(participation) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load registration.';
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 500;
    res.status(statusCode).json({ message });
  }
});

router.put('/registrations/:id/approve', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '');
  if (role !== 'organizer' && role !== 'admin') {
    res.status(403).json({ message: 'Organizer or admin role required.' });
    return;
  }

  const participationId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!isUuid(participationId)) {
    res.status(400).json({ message: 'Registration id must be a valid UUID.' });
    return;
  }

  try {
    const result = await updateRegistrationStatus({
      participationId,
      nextStatus: 'approved',
      auth: req.auth,
    });
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to approve registration.';
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 500;
    res.status(statusCode).json({ message });
  }
});

router.put('/registrations/:id/reject', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '');
  if (role !== 'organizer' && role !== 'admin') {
    res.status(403).json({ message: 'Organizer or admin role required.' });
    return;
  }

  const participationId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!isUuid(participationId)) {
    res.status(400).json({ message: 'Registration id must be a valid UUID.' });
    return;
  }

  try {
    const result = await updateRegistrationStatus({
      participationId,
      nextStatus: 'rejected',
      auth: req.auth,
    });
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to reject registration.';
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 500;
    res.status(statusCode).json({ message });
  }
});

router.get('/participations', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '');
  const activityId = typeof req.query.activityId === 'string' ? req.query.activityId.trim() : '';
  const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : 'all';
  const requestedLimit = Number(req.query.limit ?? 100);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 300)
    : 100;

  let mine = role !== 'admin';
  if (typeof req.query.mine === 'string') {
    const normalizedMine = req.query.mine.trim().toLowerCase();
    if (normalizedMine === 'true') {
      mine = true;
    } else if (normalizedMine === 'false') {
      mine = false;
    } else {
      res.status(400).json({ message: 'mine must be true or false.' });
      return;
    }
  }

  if (activityId && !isUuid(activityId)) {
    res.status(400).json({ message: 'activityId must be a valid UUID.' });
    return;
  }

  if (statusFilter !== 'all' && !validParticipationStatuses.has(statusFilter)) {
    res.status(400).json({
      message: `Invalid status filter. Allowed: all, ${Array.from(validParticipationStatuses).join(', ')}`,
    });
    return;
  }

  if (role === 'volunteer' && !mine) {
    res.status(403).json({ message: 'Volunteers can only view their own participations.' });
    return;
  }

  if (role === 'organizer' && !mine) {
    res.status(403).json({ message: 'Organizers can only view participations from their own activities.' });
    return;
  }

  if (role !== 'admin' && role !== 'organizer' && role !== 'volunteer') {
    res.status(403).json({ message: 'Invalid role for participation queries.' });
    return;
  }

  try {
    let query = supabaseAdmin
      .from('activity_participations')
      .select(participationColumns)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (role === 'volunteer') {
      query = query.eq('volunteer_id', req.auth.user.id);
    } else if (role === 'organizer') {
      if (activityId) {
        await assertActivityAccessForOrganizerOrAdmin(activityId, req.auth);
      } else {
        const { data: ownedActivities, error: ownedActivitiesError } = await supabaseAdmin
          .from('activities')
          .select('id')
          .eq('organizer_id', req.auth.user.id)
          .is('deleted_at', null)
          .limit(500);

        if (ownedActivitiesError) {
          res.status(500).json({ message: ownedActivitiesError.message });
          return;
        }

        const ownedActivityIds = (ownedActivities ?? []).map((row) => row.id).filter(Boolean);
        if (ownedActivityIds.length === 0) {
          res.json({ participations: [] });
          return;
        }

        query = query.in('activity_id', ownedActivityIds);
      }
    } else if (role === 'admin' && mine) {
      query = query.eq('volunteer_id', req.auth.user.id);
    }

    if (activityId) {
      query = query.eq('activity_id', activityId);
    }

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ message: error.message });
      return;
    }

    const participationsWithVolunteers = await attachVolunteerSummaries(data ?? []);
    const participations = await attachActivitySummaries(participationsWithVolunteers);
    res.json({ participations });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load participations.';
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 500;
    res.status(statusCode).json({ message });
  }
});

router.post('/participations', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '');
  if (role !== 'volunteer' && role !== 'admin') {
    res.status(403).json({ message: 'Only volunteers/admin can create participations.' });
    return;
  }

  let payload;
  try {
    payload = normalizeParticipationCreatePayload(req.body);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid payload.' });
    return;
  }

  try {
    const result = await createRegistration({
      activityId: payload.activity_id,
      volunteerId: req.auth.user.id,
      requesterRole: role,
      recommendationItemId: req.body?.recommendation_item_id,
    });

    res.status(result.created ? 201 : 200).json({
      participation: result.registration,
      created: result.created,
      message: result.message,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create participation.';
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 500;
    res.status(statusCode).json({ message });
  }
});

router.post('/participations/:id/check-in', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '');
  if (role !== 'organizer' && role !== 'admin') {
    res.status(403).json({ message: 'Organizer or admin role required.' });
    return;
  }

  const participationId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!isUuid(participationId)) {
    res.status(400).json({ message: 'Participation id must be a valid UUID.' });
    return;
  }

  let providedCode;
  try {
    providedCode = parseAndValidateCheckInCode(req.body?.checkInCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid check-in code.';
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 400;
    res.status(statusCode).json({ message });
    return;
  }

  try {
    const { participation, activity } = await getRegistrationWithActivityForAccess(participationId, req.auth);

    const expectedCode = normalizeCheckInCode(generateCheckInCode(participation.id));
    if (!expectedCode || expectedCode !== providedCode) {
      res.status(400).json({ message: 'Invalid check-in code for this registration.' });
      return;
    }

    const result = await performCheckIn({ participation, activity, actorUserId: req.auth.user.id });
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to check in participant.';
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 500;
    res.status(statusCode).json({ message });
  }
});

router.post('/activities/:id/check-in-by-code', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '');
  if (role !== 'organizer' && role !== 'admin') {
    res.status(403).json({ message: 'Organizer or admin role required.' });
    return;
  }

  const activityId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!isUuid(activityId)) {
    res.status(400).json({ message: 'Activity id must be a valid UUID.' });
    return;
  }

  let submittedCode;
  try {
    submittedCode = parseAndValidateCheckInCode(req.body?.checkInCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid check-in code.';
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 400;
    res.status(statusCode).json({ message });
    return;
  }

  try {
    const activity = await assertActivityAccessForOrganizerOrAdmin(activityId, req.auth);
    if (!isSameCalendarDate(activity.start_time)) {
      throw createCheckInDateLockedError(activity);
    }

    const { data, error } = await supabaseAdmin
      .from('activity_participations')
      .select(participationColumns)
      .eq('activity_id', activityId)
      .in('status', ['assigned', 'pending', 'approved', 'checked_in', 'rejected', 'cancelled'])
      .limit(1000);

    if (error) {
      res.status(500).json({ message: error.message });
      return;
    }

    const participation = (data ?? []).find((row) => {
      const rowCode = normalizeCheckInCode(generateCheckInCode(row.id));
      return Boolean(rowCode) && rowCode === submittedCode;
    });

    if (!participation) {
      res.status(404).json({ message: 'Invalid check-in code for this activity.' });
      return;
    }

    const result = await performCheckIn({ participation, activity, actorUserId: req.auth.user.id });
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to check in by code.';
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 500;
    res.status(statusCode).json({ message });
  }
});

export default router;
