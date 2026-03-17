import { Router } from 'express';
import { feedbackColumns, feedbackEligibleParticipationStatuses } from '../config/constants.js';
import { isUuid } from '../common/utils/validators.js';
import { supabaseAdmin } from '../database/supabase.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { normalizeFeedbackPayload } from './feedback.validation.js';

const router = Router();

router.get('/feedback', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '');
  const mineDefault = role !== 'admin';
  let mine = mineDefault;

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

  if (!mine && role !== 'admin') {
    res.status(403).json({ message: 'Only admin can query all feedback.' });
    return;
  }

  const requestedLimit = Number(req.query.limit ?? 50);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 200)
    : 50;

  const participationId =
    typeof req.query.participationId === 'string'
      ? req.query.participationId.trim()
      : typeof req.query.participation_id === 'string'
        ? req.query.participation_id.trim()
        : '';
  const ratingFilterRaw = req.query.rating;
  let ratingFilter = null;

  if (participationId && !isUuid(participationId)) {
    res.status(400).json({ message: 'participationId must be a valid UUID.' });
    return;
  }

  if (typeof ratingFilterRaw === 'string' && ratingFilterRaw.trim().length > 0) {
    const parsedRating = Number(ratingFilterRaw);
    if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
      res.status(400).json({ message: 'rating must be an integer between 1 and 5.' });
      return;
    }
    ratingFilter = parsedRating;
  }

  let query = supabaseAdmin.from('participation_feedback').select(feedbackColumns).order('created_at', {
    ascending: false,
  });

  if (role === 'admin') {
    if (mine) {
      query = query.eq('volunteer_id', req.auth.user.id);
    }
  } else if (role === 'organizer') {
    query = query.eq('organizer_id', req.auth.user.id);
  } else {
    query = query.eq('volunteer_id', req.auth.user.id);
  }

  if (participationId) {
    query = query.eq('participation_id', participationId);
  }

  if (ratingFilter !== null) {
    query = query.eq('rating', ratingFilter);
  }

  query = query.limit(limit);

  const { data, error } = await query;
  if (error) {
    res.status(500).json({ message: error.message });
    return;
  }

  res.json({ feedbacks: data ?? [] });
});

router.post('/feedback', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '');
  if (role !== 'volunteer' && role !== 'admin') {
    res.status(403).json({ message: 'Only volunteers/admin can submit feedback.' });
    return;
  }

  let payload;
  try {
    payload = normalizeFeedbackPayload(req.body);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid payload.' });
    return;
  }

  const { data: participation, error: participationError } = await supabaseAdmin
    .from('activity_participations')
    .select('id, volunteer_id, activity_id, status')
    .eq('id', payload.participation_id)
    .maybeSingle();

  if (participationError) {
    res.status(500).json({ message: participationError.message });
    return;
  }

  if (!participation) {
    res.status(404).json({ message: 'Participation not found.' });
    return;
  }

  if (role !== 'admin' && participation.volunteer_id !== req.auth.user.id) {
    res.status(403).json({ message: 'You can submit feedback only for your own participation.' });
    return;
  }

  const participationStatus = String(participation.status ?? '').toLowerCase();
  if (!feedbackEligibleParticipationStatuses.has(participationStatus)) {
    res.status(400).json({ message: 'Feedback can be submitted only for approved or checked-in participations.' });
    return;
  }

  const { data: activity, error: activityError } = await supabaseAdmin
    .from('activities')
    .select('id, organizer_id, status')
    .eq('id', participation.activity_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (activityError) {
    res.status(500).json({ message: activityError.message });
    return;
  }

  if (!activity) {
    res.status(404).json({ message: 'Activity not found for this participation.' });
    return;
  }

  const activityStatus = String(activity.status ?? '').toLowerCase();
  if (participationStatus !== 'checked_in' && activityStatus !== 'completed') {
    res.status(400).json({ message: 'Feedback can be submitted only after the activity is completed.' });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('participation_feedback')
    .upsert(
      {
        participation_id: payload.participation_id,
        volunteer_id: participation.volunteer_id,
        organizer_id: activity.organizer_id ?? null,
        rating: payload.rating,
        comment: payload.comment,
      },
      { onConflict: 'participation_id' }
    )
    .select(feedbackColumns)
    .maybeSingle();

  if (error) {
    if (error.code === '23514' || error.code === '22P02' || error.code === '23502' || error.code === '23503') {
      res.status(400).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: error.message });
    return;
  }

  res.status(201).json({ feedback: data });
});

export default router;
