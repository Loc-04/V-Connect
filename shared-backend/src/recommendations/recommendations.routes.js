import { Router } from 'express';
import { participationColumns } from '../config/constants.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { supabaseAdmin } from '../database/supabase.js';
import { isUuid } from '../common/utils/validators.js';
import { getActivityById } from '../activities/activities.service.js';
import { createNotificationRecord } from '../notifications/notifications.service.js';
import { attachActivitySummaries, attachVolunteerSummaries } from '../participations/participations.service.js';
import { getProfileByUserId } from '../users/users.service.js';
import { recommend as aiRecommend } from '../ai/ai.router.js';
import {
  tryLogRecommendationInteraction,
  tryPersistRecommendationServingItems,
} from './recommendation.logging.js';

const router = Router();
const assignmentStatuses = new Set(['assigned', 'approved', 'rejected', 'cancelled']);

function getRequestedLimit(rawValue, fallback = 10, max = 50) {
  const requestedLimit = Number(rawValue ?? fallback);
  return Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), max) : fallback;
}

function asUuidOrNull(value) {
  const raw = String(value ?? '').trim();
  return isUuid(raw) ? raw : null;
}

function buildServingKey({ rankPosition, candidateActivityId, candidateVolunteerId }) {
  return `${rankPosition}::${candidateActivityId ?? '-'}::${candidateVolunteerId ?? '-'}`;
}

async function persistServingForUserResult({ result, requesterUserId, targetUserId }) {
  const activities = Array.isArray(result?.activities) ? result.activities : null;
  const volunteers = Array.isArray(result?.volunteers) ? result.volunteers : null;

  let rows = [];
  if (activities) {
    rows = activities.map((item, index) => ({
      scope: 'volunteer_to_activity',
      requester_user_id: requesterUserId,
      target_user_id: targetUserId,
      target_activity_id: null,
      candidate_type: 'activity',
      candidate_activity_id: item?.activityId ?? null,
      candidate_volunteer_id: null,
      rank_position: index + 1,
      predicted_score: Number(item?.matchScore ?? 0),
      model_version: item?.model_version ?? null,
      provider: item?.provider ?? 'internal',
      feature_snapshot: item?.feature_snapshot ?? null,
      prediction_snapshot: item?.prediction_snapshot ?? null,
    }));
  } else if (volunteers) {
    rows = volunteers
      .map((item, index) => ({
        scope: 'activity_to_volunteer',
        requester_user_id: requesterUserId,
        target_user_id: null,
        target_activity_id: asUuidOrNull(item?.matchedActivityId),
        candidate_type: 'volunteer',
        candidate_activity_id: null,
        candidate_volunteer_id: item?.userId ?? null,
        rank_position: index + 1,
        predicted_score: Number(item?.matchScore ?? 0),
        model_version: item?.model_version ?? null,
        provider: item?.provider ?? 'internal',
        feature_snapshot: item?.feature_snapshot ?? null,
        prediction_snapshot: item?.prediction_snapshot ?? null,
      }))
      .filter((row) => row.target_activity_id);
  }

  if (rows.length === 0) {
    return result;
  }

  const inserted = await tryPersistRecommendationServingItems(rows, 'recommendations.user.serving');
  if (!Array.isArray(inserted) || inserted.length === 0) {
    return result;
  }

  const insertedByKey = new Map(
    inserted.map((row) => [
      buildServingKey({
        rankPosition: Number(row.rank_position ?? 0),
        candidateActivityId: asUuidOrNull(row.candidate_activity_id),
        candidateVolunteerId: asUuidOrNull(row.candidate_volunteer_id),
      }),
      row.id,
    ])
  );

  if (activities) {
    return {
      ...result,
      activities: activities.map((item, index) => ({
        ...item,
        recommendation_item_id:
          insertedByKey.get(
            buildServingKey({
              rankPosition: index + 1,
              candidateActivityId: asUuidOrNull(item?.activityId),
              candidateVolunteerId: null,
            })
          ) ?? null,
      })),
    };
  }

  if (volunteers) {
    return {
      ...result,
      volunteers: volunteers.map((item, index) => ({
        ...item,
        recommendation_item_id:
          insertedByKey.get(
            buildServingKey({
              rankPosition: index + 1,
              candidateActivityId: null,
              candidateVolunteerId: asUuidOrNull(item?.userId),
            })
          ) ?? null,
      })),
    };
  }

  return result;
}

async function persistServingForActivityResult({ result, requesterUserId, targetActivityId }) {
  const volunteers = Array.isArray(result?.volunteers) ? result.volunteers : [];
  if (volunteers.length === 0) {
    return result;
  }

  const rows = volunteers.map((item, index) => ({
    scope: 'activity_to_volunteer',
    requester_user_id: requesterUserId,
    target_user_id: null,
    target_activity_id: targetActivityId,
    candidate_type: 'volunteer',
    candidate_activity_id: null,
    candidate_volunteer_id: item?.userId ?? null,
    rank_position: index + 1,
    predicted_score: Number(item?.matchScore ?? 0),
    model_version: item?.model_version ?? null,
    provider: item?.provider ?? 'internal',
    feature_snapshot: item?.feature_snapshot ?? null,
    prediction_snapshot: item?.prediction_snapshot ?? null,
  }));

  const inserted = await tryPersistRecommendationServingItems(rows, 'recommendations.activity.serving');
  if (!Array.isArray(inserted) || inserted.length === 0) {
    return result;
  }

  const insertedByKey = new Map(
    inserted.map((row) => [
      buildServingKey({
        rankPosition: Number(row.rank_position ?? 0),
        candidateActivityId: null,
        candidateVolunteerId: asUuidOrNull(row.candidate_volunteer_id),
      }),
      row.id,
    ])
  );

  return {
    ...result,
    volunteers: volunteers.map((item, index) => ({
      ...item,
      recommendation_item_id:
        insertedByKey.get(
          buildServingKey({
            rankPosition: index + 1,
            candidateActivityId: null,
            candidateVolunteerId: asUuidOrNull(item?.userId),
          })
        ) ?? null,
    })),
  };
}

async function tryCreateNotification(payload) {
  try {
    await createNotificationRecord(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Notification create failed: ${message}`);
  }
}

async function getUserDisplayName(userId, fallback = 'Volunteer') {
  try {
    const profile = await getProfileByUserId(userId);
    const fullName = String(profile?.full_name ?? '').trim();
    return fullName || fallback;
  } catch {
    return fallback;
  }
}

async function enrichAssignment(assignment) {
  if (!assignment) {
    return null;
  }

  const [withVolunteer] = await attachVolunteerSummaries([assignment]);
  const [withActivity] = await attachActivitySummaries([withVolunteer ?? assignment]);
  return withActivity ?? withVolunteer ?? assignment;
}

async function getAssignmentRecord(assignmentId) {
  const { data, error } = await supabaseAdmin
    .from('activity_participations')
    .select(participationColumns)
    .eq('id', assignmentId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}

async function getActiveParticipationCount(activityId, excludeParticipationId = null) {
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

async function assertOrganizerActivityAccess(activityId, auth) {
  const activity = await getActivityById(activityId);
  if (!activity) {
    const error = new Error('Activity not found.');
    error.statusCode = 404;
    throw error;
  }

  const requesterRole = String(auth?.profile?.role ?? '');
  if (requesterRole !== 'admin' && activity.organizer_id !== auth.user.id) {
    const error = new Error('You can manage recommendation assignments only for your own activities.');
    error.statusCode = 403;
    throw error;
  }

  return activity;
}

async function getAssignmentWithActivityForAccess(assignmentId, auth) {
  const assignment = await getAssignmentRecord(assignmentId);
  if (!assignment) {
    const error = new Error('Assignment not found.');
    error.statusCode = 404;
    throw error;
  }

  const activity = await assertOrganizerActivityAccess(assignment.activity_id, auth);
  return { assignment, activity };
}

async function assertVolunteerTarget(volunteerId) {
  const volunteer = await getProfileByUserId(volunteerId);
  if (!volunteer || volunteer.role !== 'volunteer' || volunteer.deleted_at) {
    const error = new Error('Volunteer user not found.');
    error.statusCode = 404;
    throw error;
  }

  if (String(volunteer.status ?? '').toLowerCase() !== 'active') {
    const error = new Error('Volunteer must be active before assignment.');
    error.statusCode = 400;
    throw error;
  }

  return volunteer;
}

function getAssignmentNotificationMeta(status, activityTitle, volunteerName) {
  switch (status) {
    case 'assigned':
      return {
        volunteerTitle: 'Activity Assigned',
        volunteerMessage: `You were assigned to "${activityTitle}".`,
        organizerTitle: 'Volunteer Assigned',
        organizerMessage: `${volunteerName} was assigned to "${activityTitle}".`,
        type: 'opportunity',
      };
    case 'approved':
      return {
        volunteerTitle: 'Assignment Approved',
        volunteerMessage: `Your assignment for "${activityTitle}" has been approved.`,
        organizerTitle: 'Assignment Approved',
        organizerMessage: `${volunteerName} was approved for "${activityTitle}".`,
        type: 'approval',
      };
    case 'rejected':
      return {
        volunteerTitle: 'Assignment Rejected',
        volunteerMessage: `Your assignment for "${activityTitle}" has been rejected.`,
        organizerTitle: 'Assignment Rejected',
        organizerMessage: `${volunteerName} was rejected for "${activityTitle}".`,
        type: 'approval',
      };
    case 'cancelled':
      return {
        volunteerTitle: 'Assignment Cancelled',
        volunteerMessage: `Your assignment for "${activityTitle}" has been cancelled.`,
        organizerTitle: 'Volunteer Unassigned',
        organizerMessage: `${volunteerName} was unassigned from "${activityTitle}".`,
        type: 'message',
      };
    default:
      return {
        volunteerTitle: 'Assignment Updated',
        volunteerMessage: `Your assignment for "${activityTitle}" was updated to ${status}.`,
        organizerTitle: 'Assignment Updated',
        organizerMessage: `${volunteerName}'s assignment for "${activityTitle}" was updated to ${status}.`,
        type: 'message',
      };
  }
}

async function notifyAssignmentStatus({ activity, volunteerId, assignmentId, status }) {
  const volunteerName = await getUserDisplayName(volunteerId);
  const meta = getAssignmentNotificationMeta(status, activity.title, volunteerName);

  await tryCreateNotification({
    userId: volunteerId,
    title: meta.volunteerTitle,
    message: meta.volunteerMessage,
    type: meta.type,
    data: {
      activityId: activity.id,
      registrationId: assignmentId,
      volunteerId,
      status,
      source: 'recommendation-assignment',
    },
  });

  if (activity.organizer_id) {
    await tryCreateNotification({
      userId: activity.organizer_id,
      title: meta.organizerTitle,
      message: meta.organizerMessage,
      type: meta.type,
      data: {
        activityId: activity.id,
        registrationId: assignmentId,
        volunteerId,
        status,
        source: 'recommendation-assignment',
      },
    });
  }
}

router.get('/recommendations/:userId', requireAuth, async (req, res) => {
  const userId = typeof req.params.userId === 'string' ? req.params.userId.trim() : '';
  if (!isUuid(userId)) {
    res.status(400).json({ message: 'userId must be a valid UUID.' });
    return;
  }

  const requesterRole = String(req.auth?.profile?.role ?? '');
  const requesterId = String(req.auth?.user?.id ?? '');
  if (requesterRole !== 'admin' && requesterId !== userId) {
    res.status(403).json({ message: 'You can request recommendations only for your own account.' });
    return;
  }

  try {
    const result = await aiRecommend({
      scope: 'user',
      userId,
      limit: getRequestedLimit(req.query.limit),
    });
    const withServingLog = await persistServingForUserResult({
      result,
      requesterUserId: requesterId,
      targetUserId: userId,
    });
    res.json(withServingLog);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load recommendations.';
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 500;
    res.status(statusCode).json({ message });
  }
});

router.get('/recommendations/activity/:id', requireAuth, async (req, res) => {
  const activityId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!isUuid(activityId)) {
    res.status(400).json({ message: 'Activity id must be a valid UUID.' });
    return;
  }

  const requesterRole = String(req.auth?.profile?.role ?? '');
  if (requesterRole !== 'organizer' && requesterRole !== 'admin') {
    res.status(403).json({ message: 'Organizer or admin role required.' });
    return;
  }

  try {
    const activity = await getActivityById(activityId);
    if (!activity) {
      res.status(404).json({ message: 'Activity not found.' });
      return;
    }

    if (requesterRole !== 'admin' && activity.organizer_id !== req.auth.user.id) {
      res.status(403).json({ message: 'You can request recommendations only for your own activities.' });
      return;
    }

    const result = await aiRecommend({
      scope: 'activity',
      activityId,
      limit: getRequestedLimit(req.query.limit),
    });
    const withServingLog = await persistServingForActivityResult({
      result,
      requesterUserId: req.auth.user.id,
      targetActivityId: activityId,
    });
    res.json(withServingLog);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load activity recommendations.';
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 500;
    res.status(statusCode).json({ message });
  }
});

router.post('/recommendations/interactions', requireAuth, async (req, res) => {
  const eventType = typeof req.body?.event_type === 'string' ? req.body.event_type.trim().toLowerCase() : '';
  if (!['detail_open', 'register', 'approved', 'rejected', 'checked_in', 'cancelled'].includes(eventType)) {
    res.status(400).json({ message: 'Invalid event_type.' });
    return;
  }

  const servingItemId = asUuidOrNull(req.body?.serving_item_id);
  const activityId = asUuidOrNull(req.body?.activity_id);
  const volunteerId = asUuidOrNull(req.body?.volunteer_id);
  const participationId = asUuidOrNull(req.body?.participation_id);
  const sourceSurface = typeof req.body?.source_surface === 'string' ? req.body.source_surface.trim() : 'web';
  const metadata =
    req.body?.metadata && typeof req.body.metadata === 'object' && !Array.isArray(req.body.metadata)
      ? req.body.metadata
      : null;

  await tryLogRecommendationInteraction(
    {
      event_type: eventType,
      serving_item_id: servingItemId,
      actor_user_id: req.auth.user.id,
      activity_id: activityId,
      volunteer_id: volunteerId ?? req.auth.user.id,
      participation_id: participationId,
      source_surface: sourceSurface || 'web',
      metadata,
    },
    'recommendations.interactions.route'
  );

  res.status(202).json({ ok: true });
});

router.post('/recommendations/activity/:id/assignments', requireAuth, async (req, res) => {
  const requesterRole = String(req.auth?.profile?.role ?? '');
  if (requesterRole !== 'organizer' && requesterRole !== 'admin') {
    res.status(403).json({ message: 'Organizer or admin role required.' });
    return;
  }

  const activityId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!isUuid(activityId)) {
    res.status(400).json({ message: 'Activity id must be a valid UUID.' });
    return;
  }

  const volunteerId =
    typeof req.body?.volunteerId === 'string'
      ? req.body.volunteerId.trim()
      : typeof req.body?.userId === 'string'
        ? req.body.userId.trim()
        : '';

  if (!isUuid(volunteerId)) {
    res.status(400).json({ message: 'volunteerId must be a valid UUID.' });
    return;
  }

  const recommendationItemId = asUuidOrNull(req.body?.recommendation_item_id);

  try {
    const [activity] = await Promise.all([
      assertOrganizerActivityAccess(activityId, req.auth),
      assertVolunteerTarget(volunteerId),
    ]);

    const { data: existingAssignment, error: existingError } = await supabaseAdmin
      .from('activity_participations')
      .select(participationColumns)
      .eq('activity_id', activityId)
      .eq('volunteer_id', volunteerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      res.status(500).json({ message: existingError.message });
      return;
    }

    if (existingAssignment && ['assigned', 'pending', 'approved', 'checked_in'].includes(String(existingAssignment.status ?? ''))) {
      let assignmentSnapshot = existingAssignment;
      if (
        String(existingAssignment.registration_source ?? '').trim().toLowerCase() !== 'organizer_assignment' ||
        recommendationItemId
      ) {
        const reassociateResult = await supabaseAdmin
          .from('activity_participations')
          .update({
            registration_source: 'organizer_assignment',
            recommendation_item_id: recommendationItemId ?? existingAssignment.recommendation_item_id ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingAssignment.id)
          .select(participationColumns)
          .maybeSingle();

        if (!reassociateResult.error && reassociateResult.data) {
          assignmentSnapshot = reassociateResult.data;
        }
      }

      res.status(200).json({
        assignment: await enrichAssignment(assignmentSnapshot),
        created: false,
        message: 'Volunteer is already linked to this activity.',
      });
      return;
    }

    const activeCount = await getActiveParticipationCount(activityId, existingAssignment?.id ?? null);
    if ((activeCount ?? 0) >= Number(activity.capacity ?? 0)) {
      res.status(400).json({ message: 'Activity is full. Cannot assign more volunteers.' });
      return;
    }

    const match = await aiRecommend({
      scope: 'match',
      activity,
      volunteerId,
    });
    const now = new Date().toISOString();

    let assignment;
    if (existingAssignment) {
      const updateResult = await supabaseAdmin
        .from('activity_participations')
        .update({
          status: 'assigned',
          ai_match_score: typeof match.matchRatio === 'number' ? match.matchRatio : null,
          recommendation_item_id: recommendationItemId,
          registration_source: 'organizer_assignment',
          updated_at: now,
        })
        .eq('id', existingAssignment.id)
        .select(participationColumns)
        .maybeSingle();

      if (updateResult.error) {
        if (updateResult.error.code === '23514') {
          res.status(400).json({
            message: 'The database status constraint does not allow "assigned" yet. Run the participation status migration first.',
          });
          return;
        }
        res.status(500).json({ message: updateResult.error.message });
        return;
      }

      assignment = updateResult.data;
    } else {
      const insertResult = await supabaseAdmin
        .from('activity_participations')
        .insert({
          activity_id: activityId,
          volunteer_id: volunteerId,
          status: 'assigned',
          ai_match_score: typeof match.matchRatio === 'number' ? match.matchRatio : null,
          recommendation_item_id: recommendationItemId,
          registration_source: 'organizer_assignment',
          updated_at: now,
        })
        .select(participationColumns)
        .maybeSingle();

      if (insertResult.error) {
        if (insertResult.error.code === '23514') {
          res.status(400).json({
            message: 'The database status constraint does not allow "assigned" yet. Run the participation status migration first.',
          });
          return;
        }
        res.status(500).json({ message: insertResult.error.message });
        return;
      }

      assignment = insertResult.data;
    }

    await notifyAssignmentStatus({
      activity,
      volunteerId,
      assignmentId: assignment?.id ?? null,
      status: 'assigned',
    });

    res.status(existingAssignment ? 200 : 201).json({
      assignment: await enrichAssignment(assignment),
      created: !existingAssignment,
      message: existingAssignment ? 'Assignment reopened successfully.' : 'Volunteer assigned successfully.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to assign volunteer.';
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 500;
    res.status(statusCode).json({ message });
  }
});

router.put('/recommendations/assignments/:id/status', requireAuth, async (req, res) => {
  const requesterRole = String(req.auth?.profile?.role ?? '');
  if (requesterRole !== 'organizer' && requesterRole !== 'admin') {
    res.status(403).json({ message: 'Organizer or admin role required.' });
    return;
  }

  const assignmentId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!isUuid(assignmentId)) {
    res.status(400).json({ message: 'Assignment id must be a valid UUID.' });
    return;
  }

  const nextStatus = typeof req.body?.status === 'string' ? req.body.status.trim().toLowerCase() : '';
  if (!assignmentStatuses.has(nextStatus)) {
    res.status(400).json({
      message: `Invalid assignment status. Allowed: ${Array.from(assignmentStatuses).join(', ')}`,
    });
    return;
  }

  try {
    const { assignment, activity } = await getAssignmentWithActivityForAccess(assignmentId, req.auth);
    const currentStatus = String(assignment.status ?? '').toLowerCase();

    if (currentStatus === 'checked_in') {
      res.status(400).json({ message: 'Checked-in assignment cannot be changed.' });
      return;
    }

    if (currentStatus === nextStatus) {
      res.json({
        assignment: await enrichAssignment(assignment),
        message: `Assignment already ${nextStatus}.`,
      });
      return;
    }

    if (nextStatus === 'approved') {
      const activeCount = await getActiveParticipationCount(activity.id, assignment.id);
      if ((activeCount ?? 0) >= Number(activity.capacity ?? 0)) {
        res.status(400).json({ message: 'Activity is full. Cannot approve more assignments.' });
        return;
      }
    }

    const { data, error } = await supabaseAdmin
      .from('activity_participations')
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', assignment.id)
      .select(participationColumns)
      .maybeSingle();

    if (error) {
      if (error.code === '23514') {
        res.status(400).json({
          message: `The database status constraint rejected "${nextStatus}". Update the participation status constraint first.`,
        });
        return;
      }
      res.status(500).json({ message: error.message });
      return;
    }

    await notifyAssignmentStatus({
      activity,
      volunteerId: assignment.volunteer_id,
      assignmentId: assignment.id,
      status: nextStatus,
    });
    await tryLogRecommendationInteraction(
      {
        event_type: nextStatus,
        serving_item_id: data?.recommendation_item_id ?? assignment?.recommendation_item_id ?? null,
        actor_user_id: req.auth.user.id,
        activity_id: data?.activity_id ?? assignment.activity_id,
        volunteer_id: data?.volunteer_id ?? assignment.volunteer_id,
        participation_id: data?.id ?? assignment.id,
        source_surface: 'web',
      },
      'recommendations.assignment.status'
    );

    res.json({
      assignment: await enrichAssignment(data),
      message: `Assignment ${nextStatus} successfully.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update assignment status.';
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 500;
    res.status(statusCode).json({ message });
  }
});

router.delete('/recommendations/assignments/:id', requireAuth, async (req, res) => {
  const requesterRole = String(req.auth?.profile?.role ?? '');
  if (requesterRole !== 'organizer' && requesterRole !== 'admin') {
    res.status(403).json({ message: 'Organizer or admin role required.' });
    return;
  }

  const assignmentId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!isUuid(assignmentId)) {
    res.status(400).json({ message: 'Assignment id must be a valid UUID.' });
    return;
  }

  try {
    const { assignment, activity } = await getAssignmentWithActivityForAccess(assignmentId, req.auth);
    const currentStatus = String(assignment.status ?? '').toLowerCase();

    if (currentStatus === 'checked_in') {
      res.status(400).json({ message: 'Checked-in assignment cannot be unassigned.' });
      return;
    }

    if (currentStatus === 'cancelled') {
      res.json({
        assignment: await enrichAssignment(assignment),
        message: 'Assignment already cancelled.',
      });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('activity_participations')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', assignment.id)
      .select(participationColumns)
      .maybeSingle();

    if (error) {
      res.status(500).json({ message: error.message });
      return;
    }

    await notifyAssignmentStatus({
      activity,
      volunteerId: assignment.volunteer_id,
      assignmentId: assignment.id,
      status: 'cancelled',
    });
    await tryLogRecommendationInteraction(
      {
        event_type: 'cancelled',
        serving_item_id: data?.recommendation_item_id ?? assignment?.recommendation_item_id ?? null,
        actor_user_id: req.auth.user.id,
        activity_id: data?.activity_id ?? assignment.activity_id,
        volunteer_id: data?.volunteer_id ?? assignment.volunteer_id,
        participation_id: data?.id ?? assignment.id,
        source_surface: 'web',
      },
      'recommendations.assignment.cancel'
    );

    res.json({
      assignment: await enrichAssignment(data),
      message: 'Volunteer unassigned successfully.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to unassign volunteer.';
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 500;
    res.status(statusCode).json({ message });
  }
});

export default router;
