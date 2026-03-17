import { Router } from 'express';
import { userColumns, validRoles } from '../config/constants.js';
import { supabaseAdmin } from '../database/supabase.js';
import { requireAdmin, requireAuth } from '../auth/auth.middleware.js';
import { countRows, getDistribution } from './admin.service.js';

const router = Router();

router.get('/admin/users', requireAuth, requireAdmin, async (req, res) => {
  const roleFilter = typeof req.query.role === 'string' ? req.query.role : 'all';
  const statusFilter = typeof req.query.status === 'string' ? req.query.status : 'all';
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

  if (roleFilter !== 'all' && !validRoles.has(roleFilter)) {
    res.status(400).json({ message: 'Invalid role filter.' });
    return;
  }

  let query = supabaseAdmin.from('users').select(userColumns).is('deleted_at', null).order('created_at', {
    ascending: false,
  });

  if (roleFilter !== 'all') {
    query = query.eq('role', roleFilter);
  }
  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;
  if (error) {
    res.status(500).json({ message: error.message });
    return;
  }

  const users = (data ?? []).filter((user) => {
    if (!search) {
      return true;
    }

    return (
      String(user.id).toLowerCase().includes(search) ||
      String(user.full_name ?? '').toLowerCase().includes(search) ||
      String(user.phone ?? '').toLowerCase().includes(search)
    );
  });

  res.json({ users });
});

router.patch('/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const targetUserId = req.params.id;
  const nextRole = req.body?.role;
  const nextStatus = typeof req.body?.status === 'string' ? req.body.status.trim().toLowerCase() : undefined;

  if (nextRole && !validRoles.has(nextRole)) {
    res.status(400).json({ message: 'Invalid role value.' });
    return;
  }
  if (!nextRole && !nextStatus) {
    res.status(400).json({ message: 'At least one field is required: role or status.' });
    return;
  }

  if (targetUserId === req.auth.user.id && nextRole && nextRole !== 'admin') {
    res.status(400).json({ message: 'You cannot downgrade your own admin role.' });
    return;
  }

  const updates = {
    ...(nextRole ? { role: nextRole } : {}),
    ...(nextStatus ? { status: nextStatus } : {}),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('users')
    .update(updates)
    .eq('id', targetUserId)
    .is('deleted_at', null)
    .select(userColumns)
    .maybeSingle();

  if (error) {
    if (error.code === '23514' || error.code === '22P02') {
      res.status(400).json({ message: `Invalid role or status value: ${error.message}` });
      return;
    }
    res.status(500).json({ message: error.message });
    return;
  }

  if (!data) {
    res.status(404).json({ message: 'User not found.' });
    return;
  }

  res.json({ user: data });
});

router.delete('/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const targetUserId = req.params.id;

  if (!targetUserId) {
    res.status(400).json({ message: 'User id is required.' });
    return;
  }

  if (targetUserId === req.auth.user.id) {
    res.status(400).json({ message: 'You cannot delete your own account.' });
    return;
  }

  try {
    const { data: existingUser, error: existingError } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('id', targetUserId)
      .maybeSingle();

    if (existingError) {
      res.status(500).json({ message: existingError.message });
      return;
    }

    if (!existingUser) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }

    const { data: activities, error: activitiesError } = await supabaseAdmin
      .from('activities')
      .select('id')
      .eq('organizer_id', targetUserId)
      .is('deleted_at', null);

    if (activitiesError) {
      res.status(500).json({ message: activitiesError.message });
      return;
    }

    const activityIds = (activities ?? []).map((activity) => activity.id);
    let participationIds = [];

    if (activityIds.length > 0) {
      const { data: participationsForActivities, error: participationsError } = await supabaseAdmin
        .from('activity_participations')
        .select('id')
        .in('activity_id', activityIds);

      if (participationsError) {
        res.status(500).json({ message: participationsError.message });
        return;
      }

      participationIds = (participationsForActivities ?? []).map((item) => item.id);
    }

    if (participationIds.length > 0) {
      const { error: feedbackByParticipationError } = await supabaseAdmin
        .from('participation_feedback')
        .delete()
        .in('participation_id', participationIds);

      if (feedbackByParticipationError) {
        res.status(500).json({ message: feedbackByParticipationError.message });
        return;
      }
    }

    const { error: feedbackByUserError } = await supabaseAdmin
      .from('participation_feedback')
      .delete()
      .or(`volunteer_id.eq.${targetUserId},organizer_id.eq.${targetUserId}`);

    if (feedbackByUserError) {
      res.status(500).json({ message: feedbackByUserError.message });
      return;
    }

    if (activityIds.length > 0) {
      const { error: participationDeleteError } = await supabaseAdmin
        .from('activity_participations')
        .delete()
        .in('activity_id', activityIds);

      if (participationDeleteError) {
        res.status(500).json({ message: participationDeleteError.message });
        return;
      }

      const { error: reportDeleteError } = await supabaseAdmin
        .from('activity_reports')
        .delete()
        .in('activity_id', activityIds);

      if (reportDeleteError) {
        res.status(500).json({ message: reportDeleteError.message });
        return;
      }
    }

    const { error: participationByVolunteerError } = await supabaseAdmin
      .from('activity_participations')
      .delete()
      .eq('volunteer_id', targetUserId);

    if (participationByVolunteerError) {
      res.status(500).json({ message: participationByVolunteerError.message });
      return;
    }

    if (activityIds.length > 0) {
      const { error: activitiesDeleteError } = await supabaseAdmin
        .from('activities')
        .delete()
        .in('id', activityIds);

      if (activitiesDeleteError) {
        res.status(500).json({ message: activitiesDeleteError.message });
        return;
      }
    }

    const { error: volunteerProfileDeleteError } = await supabaseAdmin
      .from('volunteer_profiles')
      .delete()
      .eq('user_id', targetUserId);

    if (volunteerProfileDeleteError) {
      res.status(500).json({ message: volunteerProfileDeleteError.message });
      return;
    }

    const { error: publicUserDeleteError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', targetUserId);

    if (publicUserDeleteError) {
      res.status(500).json({ message: publicUserDeleteError.message });
      return;
    }

    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
    if (authDeleteError) {
      res.status(500).json({ message: authDeleteError.message });
      return;
    }

    res.json({ success: true, userId: targetUserId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete user.';
    res.status(500).json({ message });
  }
});

router.get('/admin/dashboard', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [
      totalUsers,
      activeUsers,
      totalActivities,
      publishedActivities,
      completedActivities,
      totalParticipations,
      checkedInParticipations,
      totalReports,
      usersByRole,
      activitiesByStatus,
      participationsByStatus,
    ] = await Promise.all([
      countRows('users', { excludeDeleted: true }),
      countRows('users', { filters: { status: 'active' }, excludeDeleted: true }),
      countRows('activities', { excludeDeleted: true }),
      countRows('activities', { filters: { status: 'published' }, excludeDeleted: true }),
      countRows('activities', { filters: { status: 'completed' }, excludeDeleted: true }),
      countRows('activity_participations'),
      countRows('activity_participations', { filters: { status: 'checked_in' } }),
      countRows('activity_reports'),
      getDistribution('users', 'role', true),
      getDistribution('activities', 'status', true),
      getDistribution('activity_participations', 'status', false),
    ]);

    res.json({
      totalUsers,
      activeUsers,
      totalActivities,
      publishedActivities,
      completedActivities,
      totalParticipations,
      checkedInParticipations,
      totalReports,
      usersByRole,
      activitiesByStatus,
      participationsByStatus,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load dashboard metrics.';
    res.status(500).json({ message });
  }
});

export default router;
