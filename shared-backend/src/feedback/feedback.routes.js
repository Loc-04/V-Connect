import { Router } from 'express';
import { feedbackColumns, feedbackEligibleParticipationStatuses } from '../config/constants.js';
import { isPlainObject, isUuid } from '../common/utils/validators.js';
import { supabaseAdmin } from '../database/supabase.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { normalizeFeedbackPayload } from './feedback.validation.js';

const router = Router();

const moderationStatusValues = new Set(['pending', 'in_review', 'resolved', 'dismissed']);
const moderationColumnLayouts = [
  {
    statusColumn: 'review_status',
    flagColumn: 'is_flagged',
    reasonColumn: 'flag_reason',
    reviewedAtColumn: 'reviewed_at',
    reviewedByColumn: 'reviewed_by',
    updatedAtColumn: 'updated_at',
  },
  {
    statusColumn: 'moderation_status',
    flagColumn: 'is_flagged',
    reasonColumn: 'flag_reason',
    reviewedAtColumn: 'reviewed_at',
    reviewedByColumn: 'reviewed_by',
    updatedAtColumn: 'updated_at',
  },
  {
    statusColumn: 'status',
    flagColumn: 'flagged',
    reasonColumn: 'flag_reason',
    reviewedAtColumn: 'reviewed_at',
    reviewedByColumn: 'reviewed_by',
    updatedAtColumn: 'updated_at',
  },
  {
    statusColumn: null,
    flagColumn: null,
    reasonColumn: null,
    reviewedAtColumn: null,
    reviewedByColumn: null,
    updatedAtColumn: null,
  },
];

const baseFeedbackColumns = feedbackColumns
  .split(',')
  .map((column) => column.trim())
  .filter(Boolean);

function createFeedbackSelectColumns(layout) {
  const extraColumns = [
    layout.statusColumn,
    layout.flagColumn,
    layout.reasonColumn,
    layout.reviewedAtColumn,
    layout.reviewedByColumn,
    layout.updatedAtColumn,
  ].filter(Boolean);

  return Array.from(new Set([...baseFeedbackColumns, ...extraColumns])).join(', ');
}

function isMissingColumnError(error) {
  const message = String(error?.message ?? '').toLowerCase();
  return error?.code === '42703' || (message.includes('column') && message.includes('does not exist'));
}

function isModerationSchemaUnsupported(error) {
  return String(error?.message ?? '').toLowerCase().includes('moderation columns are not available');
}

function parseBooleanQuery(rawValue, fieldName) {
  if (rawValue == null || rawValue === '') {
    return null;
  }

  if (typeof rawValue !== 'string') {
    throw new Error(`${fieldName} must be true or false.`);
  }

  const normalized = rawValue.trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }

  throw new Error(`${fieldName} must be true or false.`);
}

function inferIncidentFlag(feedback) {
  const rating = Number(feedback.rating ?? 0);
  if (rating <= 2) {
    return true;
  }

  const text = String(feedback.comment ?? '').toLowerCase();
  return (
    text.includes('incident') ||
    text.includes('unsafe') ||
    text.includes('abuse') ||
    text.includes('harass') ||
    text.includes('issue') ||
    text.includes('problem') ||
    text.includes('complaint')
  );
}

function normalizeModerationStatus(statusValue, fallbackFlaggedValue) {
  if (typeof statusValue !== 'string') {
    return fallbackFlaggedValue ? 'in_review' : 'pending';
  }

  const normalized = statusValue.trim().toLowerCase();
  if (!normalized) {
    return fallbackFlaggedValue ? 'in_review' : 'pending';
  }

  if (moderationStatusValues.has(normalized)) {
    return normalized;
  }

  return fallbackFlaggedValue ? 'in_review' : 'pending';
}

function mapFeedbackRecord(feedback, layout) {
  const explicitFlagValue = layout.flagColumn ? feedback[layout.flagColumn] : null;
  const inferredFlag = typeof explicitFlagValue === 'boolean' ? explicitFlagValue : inferIncidentFlag(feedback);
  const normalizedStatus = normalizeModerationStatus(
    layout.statusColumn ? feedback[layout.statusColumn] : null,
    inferredFlag
  );

  return {
    ...feedback,
    review_status: normalizedStatus,
    is_flagged: inferredFlag,
    flag_reason: layout.reasonColumn ? feedback[layout.reasonColumn] ?? null : null,
    reviewed_at: layout.reviewedAtColumn ? feedback[layout.reviewedAtColumn] ?? null : null,
    reviewed_by: layout.reviewedByColumn ? feedback[layout.reviewedByColumn] ?? null : null,
  };
}

function canReadFeedback(role, userId, feedback) {
  if (role === 'admin') {
    return true;
  }

  if (role === 'organizer') {
    return feedback.organizer_id === userId;
  }

  return feedback.volunteer_id === userId;
}

function canModerateFeedback(role, userId, feedback) {
  if (role === 'admin') {
    return true;
  }

  return role === 'organizer' && feedback.organizer_id === userId;
}

async function queryFeedbackWithBestLayout(buildQuery, { allowFallback = true } = {}) {
  const layouts = allowFallback
    ? moderationColumnLayouts
    : moderationColumnLayouts.filter((layout) => layout.statusColumn || layout.flagColumn);

  for (const layout of layouts) {
    const selectColumns = createFeedbackSelectColumns(layout);
    const { data, error } = await buildQuery(selectColumns);

    if (!error) {
      return { data: data ?? [], layout, error: null };
    }

    if (isMissingColumnError(error) && (layout.statusColumn || layout.flagColumn)) {
      continue;
    }

    return { data: null, layout, error };
  }

  return {
    data: null,
    layout: moderationColumnLayouts[moderationColumnLayouts.length - 1],
    error: new Error('Feedback moderation columns are not available in the current database schema.'),
  };
}

async function getFeedbackByIdWithBestLayout(feedbackId, { allowFallback = true } = {}) {
  const layouts = allowFallback
    ? moderationColumnLayouts
    : moderationColumnLayouts.filter((layout) => layout.statusColumn || layout.flagColumn);

  for (const layout of layouts) {
    const selectColumns = createFeedbackSelectColumns(layout);
    const { data, error } = await supabaseAdmin
      .from('participation_feedback')
      .select(selectColumns)
      .eq('id', feedbackId)
      .maybeSingle();

    if (!error) {
      return { data: data ?? null, layout, error: null };
    }

    if (isMissingColumnError(error) && (layout.statusColumn || layout.flagColumn)) {
      continue;
    }

    return { data: null, layout, error };
  }

  return {
    data: null,
    layout: moderationColumnLayouts[moderationColumnLayouts.length - 1],
    error: new Error('Feedback moderation columns are not available in the current database schema.'),
  };
}

async function updateFeedbackWithBestLayout(feedbackId, buildPayload) {
  for (const layout of moderationColumnLayouts) {
    if (!layout.statusColumn && !layout.flagColumn) {
      continue;
    }

    const payload = buildPayload(layout);
    if (!payload || Object.keys(payload).length === 0) {
      continue;
    }

    const { data, error } = await supabaseAdmin
      .from('participation_feedback')
      .update(payload)
      .eq('id', feedbackId)
      .select(createFeedbackSelectColumns(layout))
      .maybeSingle();

    if (!error) {
      return { data: data ?? null, layout, error: null };
    }

    if (isMissingColumnError(error)) {
      continue;
    }

    return { data: null, layout, error };
  }

  return {
    data: null,
    layout: moderationColumnLayouts[moderationColumnLayouts.length - 1],
    error: new Error('Feedback moderation columns are not available in the current database schema.'),
  };
}

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

router.get('/feedback/review', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '').trim().toLowerCase();
  if (role !== 'admin' && role !== 'organizer') {
    res.status(403).json({ message: 'Organizer or admin role required.' });
    return;
  }

  const statusFilterRaw = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : 'all';
  if (statusFilterRaw !== 'all' && !moderationStatusValues.has(statusFilterRaw)) {
    res.status(400).json({
      message: `Invalid status filter. Allowed: all, ${Array.from(moderationStatusValues).join(', ')}`,
    });
    return;
  }

  let flaggedFilter = null;
  try {
    flaggedFilter = parseBooleanQuery(req.query.flagged ?? req.query.flag ?? null, 'flagged');
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'flagged must be true or false.' });
    return;
  }

  const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim().toLowerCase() : '';
  const requestedLimit = Number(req.query.limit ?? 100);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 250)
    : 100;

  const ratingFilterRaw = req.query.rating;
  let ratingFilter = null;
  if (typeof ratingFilterRaw === 'string' && ratingFilterRaw.trim().length > 0) {
    const parsed = Number(ratingFilterRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
      res.status(400).json({ message: 'rating must be an integer between 1 and 5.' });
      return;
    }
    ratingFilter = parsed;
  }

  const { data, layout, error } = await queryFeedbackWithBestLayout((selectColumns) => {
    let query = supabaseAdmin
      .from('participation_feedback')
      .select(selectColumns)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (role === 'organizer') {
      query = query.eq('organizer_id', req.auth.user.id);
    }

    if (ratingFilter !== null) {
      query = query.eq('rating', ratingFilter);
    }

    return query;
  });

  if (error) {
    res.status(500).json({ message: error.message });
    return;
  }

  const reviewedFeedbacks = (data ?? []).map((feedback) => mapFeedbackRecord(feedback, layout));
  const filteredFeedbacks = reviewedFeedbacks.filter((feedback) => {
    if (statusFilterRaw !== 'all' && feedback.review_status !== statusFilterRaw) {
      return false;
    }

    if (flaggedFilter !== null && feedback.is_flagged !== flaggedFilter) {
      return false;
    }

    if (keyword.length > 0) {
      const text = [
        String(feedback.comment ?? ''),
        String(feedback.participation_id ?? ''),
        String(feedback.volunteer_id ?? ''),
        String(feedback.organizer_id ?? ''),
      ]
        .join(' ')
        .toLowerCase();
      if (!text.includes(keyword)) {
        return false;
      }
    }

    return true;
  });

  res.json({
    feedbacks: filteredFeedbacks,
    moderation: {
      statusWritable: Boolean(layout.statusColumn),
      flagWritable: Boolean(layout.flagColumn),
    },
  });
});

router.get('/feedback/:id', requireAuth, async (req, res) => {
  const feedbackId = req.params.id;
  if (!isUuid(feedbackId)) {
    res.status(400).json({ message: 'feedback id must be a valid UUID.' });
    return;
  }

  const { data, layout, error } = await getFeedbackByIdWithBestLayout(feedbackId);
  if (error) {
    res.status(500).json({ message: error.message });
    return;
  }

  if (!data) {
    res.status(404).json({ message: 'Feedback not found.' });
    return;
  }

  const role = String(req.auth?.profile?.role ?? '').trim().toLowerCase();
  if (!canReadFeedback(role, req.auth.user.id, data)) {
    res.status(403).json({ message: 'You do not have permission to access this feedback.' });
    return;
  }

  res.json({
    feedback: mapFeedbackRecord(data, layout),
    moderation: {
      statusWritable: Boolean(layout.statusColumn),
      flagWritable: Boolean(layout.flagColumn),
    },
  });
});

router.put('/feedback/:id/status', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '').trim().toLowerCase();
  if (role !== 'admin' && role !== 'organizer') {
    res.status(403).json({ message: 'Organizer or admin role required.' });
    return;
  }

  const feedbackId = req.params.id;
  if (!isUuid(feedbackId)) {
    res.status(400).json({ message: 'feedback id must be a valid UUID.' });
    return;
  }

  if (!isPlainObject(req.body)) {
    res.status(400).json({ message: 'Body must be a JSON object.' });
    return;
  }

  const nextStatus = typeof req.body.status === 'string' ? req.body.status.trim().toLowerCase() : '';
  if (!moderationStatusValues.has(nextStatus)) {
    res.status(400).json({ message: `status must be one of: ${Array.from(moderationStatusValues).join(', ')}` });
    return;
  }

  const { data: existingFeedback, error: existingError } = await supabaseAdmin
    .from('participation_feedback')
    .select(feedbackColumns)
    .eq('id', feedbackId)
    .maybeSingle();

  if (existingError) {
    res.status(500).json({ message: existingError.message });
    return;
  }

  if (!existingFeedback) {
    res.status(404).json({ message: 'Feedback not found.' });
    return;
  }

  if (!canModerateFeedback(role, req.auth.user.id, existingFeedback)) {
    res.status(403).json({ message: 'You do not have permission to moderate this feedback.' });
    return;
  }

  const now = new Date().toISOString();
  const { data, layout, error } = await updateFeedbackWithBestLayout(feedbackId, (columnLayout) => {
    if (!columnLayout.statusColumn) {
      return null;
    }

    const payload = {
      [columnLayout.statusColumn]: nextStatus,
    };

    if (columnLayout.reviewedAtColumn) {
      payload[columnLayout.reviewedAtColumn] = now;
    }
    if (columnLayout.reviewedByColumn) {
      payload[columnLayout.reviewedByColumn] = req.auth.user.id;
    }
    if (columnLayout.updatedAtColumn) {
      payload[columnLayout.updatedAtColumn] = now;
    }

    return payload;
  });

  if (error) {
    if (isModerationSchemaUnsupported(error)) {
      res.status(409).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: error.message });
    return;
  }

  if (!data) {
    res.status(404).json({ message: 'Feedback not found.' });
    return;
  }

  res.json({ feedback: mapFeedbackRecord(data, layout) });
});

router.put('/feedback/:id/flag', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '').trim().toLowerCase();
  if (role !== 'admin' && role !== 'organizer') {
    res.status(403).json({ message: 'Organizer or admin role required.' });
    return;
  }

  const feedbackId = req.params.id;
  if (!isUuid(feedbackId)) {
    res.status(400).json({ message: 'feedback id must be a valid UUID.' });
    return;
  }

  if (!isPlainObject(req.body)) {
    res.status(400).json({ message: 'Body must be a JSON object.' });
    return;
  }

  const hasFlagField = Object.hasOwn(req.body, 'flag') || Object.hasOwn(req.body, 'flagged');
  if (!hasFlagField) {
    res.status(400).json({ message: 'flag (or flagged) is required.' });
    return;
  }

  const nextFlagRaw = Object.hasOwn(req.body, 'flag') ? req.body.flag : req.body.flagged;
  if (typeof nextFlagRaw !== 'boolean') {
    res.status(400).json({ message: 'flag must be true or false.' });
    return;
  }
  const nextFlag = nextFlagRaw;

  const reasonRaw =
    typeof req.body.reason === 'string'
      ? req.body.reason
      : typeof req.body.flagReason === 'string'
        ? req.body.flagReason
        : '';
  const reason = reasonRaw.trim();
  if (reason.length > 1000) {
    res.status(400).json({ message: 'reason must be 1000 characters or fewer.' });
    return;
  }

  const { data: existingFeedback, error: existingError } = await supabaseAdmin
    .from('participation_feedback')
    .select(feedbackColumns)
    .eq('id', feedbackId)
    .maybeSingle();

  if (existingError) {
    res.status(500).json({ message: existingError.message });
    return;
  }

  if (!existingFeedback) {
    res.status(404).json({ message: 'Feedback not found.' });
    return;
  }

  if (!canModerateFeedback(role, req.auth.user.id, existingFeedback)) {
    res.status(403).json({ message: 'You do not have permission to moderate this feedback.' });
    return;
  }

  const now = new Date().toISOString();
  const { data, layout, error } = await updateFeedbackWithBestLayout(feedbackId, (columnLayout) => {
    if (!columnLayout.flagColumn) {
      return null;
    }

    const payload = {
      [columnLayout.flagColumn]: nextFlag,
    };

    if (columnLayout.statusColumn && nextFlag) {
      payload[columnLayout.statusColumn] = 'in_review';
    }
    if (columnLayout.reasonColumn) {
      payload[columnLayout.reasonColumn] = nextFlag ? reason || null : null;
    }
    if (columnLayout.reviewedAtColumn) {
      payload[columnLayout.reviewedAtColumn] = now;
    }
    if (columnLayout.reviewedByColumn) {
      payload[columnLayout.reviewedByColumn] = req.auth.user.id;
    }
    if (columnLayout.updatedAtColumn) {
      payload[columnLayout.updatedAtColumn] = now;
    }

    return payload;
  });

  if (error) {
    if (isModerationSchemaUnsupported(error)) {
      res.status(409).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: error.message });
    return;
  }

  if (!data) {
    res.status(404).json({ message: 'Feedback not found.' });
    return;
  }

  res.json({ feedback: mapFeedbackRecord(data, layout) });
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
