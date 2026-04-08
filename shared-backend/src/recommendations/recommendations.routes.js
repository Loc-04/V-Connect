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

const router = Router();
const assignmentStatuses = new Set(['assigned', 'approved', 'rejected', 'cancelled']);

function getRequestedLimit(rawValue, fallback = 10, max = 50) {
  const requestedLimit = Number(rawValue ?? fallback);
  return Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), max) : fallback;
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
    res.json(result);
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
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load activity recommendations.';
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 500;
    res.status(statusCode).json({ message });
  }
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
      res.status(200).json({
        assignment: await enrichAssignment(existingAssignment),
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
