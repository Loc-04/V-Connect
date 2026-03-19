import { Router } from 'express';
import { participationColumns, validParticipationStatuses } from '../config/constants.js';
import { isUuid } from '../common/utils/validators.js';
import { supabaseAdmin } from '../database/supabase.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { getActivityById } from '../activities/activities.service.js';
import { normalizeParticipationCreatePayload } from './participations.validation.js';
import {
  attachActivitySummaries,
  attachVolunteerSummaries,
  getParticipationHistoryForUser,
} from './participations.service.js';
import { calculateActivityMatchForVolunteer } from '../recommendations/recommendations.service.js';

const router = Router();

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

async function getActiveRegistrationCount(activityId, excludeParticipationId = null) {
  let query = supabaseAdmin
    .from('activity_participations')
    .select('*', { head: true, count: 'exact' })
    .eq('activity_id', activityId)
    .in('status', ['pending', 'approved', 'checked_in']);

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
    const result = await calculateActivityMatchForVolunteer({ activity, volunteerId });
    return typeof result.matchRatio === 'number' ? result.matchRatio : null;
  } catch {
    return null;
  }
}

async function createRegistration({ activityId, volunteerId, requesterRole }) {
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

  if (existingRegistration && ['pending', 'approved', 'checked_in'].includes(String(existingRegistration.status ?? ''))) {
    return {
      registration: await enrichParticipation(existingRegistration),
      created: false,
      message: 'You already registered for this activity.',
    };
  }

  const activeCount = await getActiveRegistrationCount(activityId, existingRegistration?.id ?? null);
  if ((activeCount ?? 0) >= Number(activity.capacity ?? 0)) {
    const error = new Error('Activity is full.');
    error.statusCode = 400;
    throw error;
  }

  const matchRatio = await computeRegistrationMatchRatio(activity, volunteerId);
  const now = new Date().toISOString();

  let data;
  if (existingRegistration) {
    const updatePayload = {
      status: 'pending',
      ai_match_score: matchRatio,
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
        updated_at: now,
      })
      .select(participationColumns)
      .maybeSingle();

    if (insertResult.error) {
      throw new Error(insertResult.error.message);
    }

    data = insertResult.data;
  }

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

  return {
    registration: await enrichParticipation(data),
    message: `Registration ${nextStatus} successfully.`,
  };
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

  const { data: participation, error: participationError } = await supabaseAdmin
    .from('activity_participations')
    .select(participationColumns)
    .eq('id', participationId)
    .maybeSingle();

  if (participationError) {
    res.status(500).json({ message: participationError.message });
    return;
  }

  if (!participation) {
    res.status(404).json({ message: 'Participation not found.' });
    return;
  }

  let activity;
  try {
    activity = await getActivityById(participation.activity_id);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load activity.';
    res.status(500).json({ message });
    return;
  }

  if (!activity) {
    res.status(404).json({ message: 'Activity not found for this participation.' });
    return;
  }

  if (role !== 'admin' && activity.organizer_id !== req.auth.user.id) {
    res.status(403).json({ message: 'You can check in participations only for your own activities.' });
    return;
  }

  if (participation.status === 'checked_in') {
    const alreadyCheckedIn = await enrichParticipation(participation);
    res.json({
      participation: alreadyCheckedIn ?? participation,
      message: 'Participant already checked in.',
    });
    return;
  }

  if (participation.status === 'rejected') {
    res.status(400).json({ message: 'Rejected participation cannot be checked in.' });
    return;
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
    .eq('id', participationId)
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
      .eq('id', participationId)
      .select(participationColumns)
      .maybeSingle();
  }

  const { data, error } = updateResult;
  if (error) {
    if (error.code === '23514' || error.code === '22P02' || error.code === '23502' || error.code === '23503') {
      res.status(400).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: error.message });
    return;
  }

  if (!data) {
    res.status(404).json({ message: 'Participation not found.' });
    return;
  }

  const updatedParticipation = await enrichParticipation(data);
  res.json({ participation: updatedParticipation ?? data });
});

export default router;
