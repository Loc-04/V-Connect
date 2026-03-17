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

const router = Router();

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
        const activity = await getActivityById(activityId);
        if (!activity) {
          res.status(404).json({ message: 'Activity not found.' });
          return;
        }
        if (activity.organizer_id !== req.auth.user.id) {
          res.status(403).json({ message: 'You can access participations only for your own activities.' });
          return;
        }
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

        const ownedActivityIds = (ownedActivities ?? []).map((row) => row.id).filter((id) => Boolean(id));
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
    res.status(500).json({ message });
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
    const activity = await getActivityById(payload.activity_id);
    if (!activity) {
      res.status(404).json({ message: 'Activity not found.' });
      return;
    }

    if (role !== 'admin' && activity.status !== 'published') {
      res.status(403).json({ message: 'You can join only published activities.' });
      return;
    }

    const { data: existingParticipation, error: existingParticipationError } = await supabaseAdmin
      .from('activity_participations')
      .select(participationColumns)
      .eq('activity_id', payload.activity_id)
      .eq('volunteer_id', req.auth.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingParticipationError) {
      res.status(500).json({ message: existingParticipationError.message });
      return;
    }

    if (existingParticipation) {
      const [participation] = await attachVolunteerSummaries([existingParticipation]);
      res.json({
        participation,
        created: false,
        message: 'You already applied for this activity.',
      });
      return;
    }

    const { count: activeCount, error: capacityError } = await supabaseAdmin
      .from('activity_participations')
      .select('*', { head: true, count: 'exact' })
      .eq('activity_id', payload.activity_id)
      .in('status', ['pending', 'approved', 'checked_in']);

    if (capacityError) {
      res.status(500).json({ message: capacityError.message });
      return;
    }

    if ((activeCount ?? 0) >= Number(activity.capacity ?? 0)) {
      res.status(400).json({ message: 'Activity is full.' });
      return;
    }

    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('activity_participations')
      .insert({
        activity_id: payload.activity_id,
        volunteer_id: req.auth.user.id,
        status: 'pending',
        updated_at: now,
      })
      .select(participationColumns)
      .maybeSingle();

    if (error) {
      if (error.code === '23514' || error.code === '22P02' || error.code === '23502' || error.code === '23503') {
        res.status(400).json({ message: error.message });
        return;
      }
      res.status(500).json({ message: error.message });
      return;
    }

    const [participation] = await attachVolunteerSummaries(data ? [data] : []);
    res.status(201).json({
      participation: participation ?? data,
      created: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create participation.';
    res.status(500).json({ message });
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
    const [alreadyCheckedIn] = await attachVolunteerSummaries([participation]);
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

  const [updatedParticipation] = await attachVolunteerSummaries([data]);
  res.json({ participation: updatedParticipation ?? data });
});

export default router;
