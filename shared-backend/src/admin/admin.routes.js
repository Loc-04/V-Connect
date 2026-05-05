import { Router } from 'express';
import { userColumns, validRoles, validUserStatuses } from '../config/constants.js';
import { supabaseAdmin } from '../database/supabase.js';
import { requireAdmin, requireAuth } from '../auth/auth.middleware.js';
import { countRows, getDistribution } from './admin.service.js';
import { isUuid, isValidEmail } from '../common/utils/validators.js';
import { normalizeNotificationPayload, normalizeNotificationUpdatePayload } from '../notifications/notifications.validation.js';
import {
  createNotificationRecord,
  deleteNotificationRecord,
  listNotificationsForAdmin,
  updateNotificationRecord,
} from '../notifications/notifications.service.js';

const router = Router();
const AUTH_USERS_PAGE_SIZE = 1000;

async function buildAuthEmailIndex() {
  const emailByUserId = new Map();
  let page = 1;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: AUTH_USERS_PAGE_SIZE,
    });

    if (error) {
      throw error;
    }

    const chunk = data?.users ?? [];
    chunk.forEach((authUser) => {
      emailByUserId.set(authUser.id, authUser.email ?? null);
    });

    if (chunk.length < AUTH_USERS_PAGE_SIZE) {
      break;
    }

    page += 1;
  }

  return emailByUserId;
}

function attachAuthEmailsToUsers(users, emailByUserId) {
  return users.map((user) => ({
    ...user,
    email: emailByUserId.get(user.id) ?? null,
  }));
}

function normalizeAdminCreateUserPayload(body) {
  const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const role = typeof body?.role === 'string' ? body.role.trim().toLowerCase() : '';
  const phoneRaw = typeof body?.phone === 'string' ? body.phone.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!fullName) {
    throw new Error('fullName is required.');
  }
  if (!email) {
    throw new Error('email is required.');
  }
  if (!isValidEmail(email)) {
    throw new Error('email must be a valid email address.');
  }
  if (!role || !validRoles.has(role)) {
    throw new Error('role must be one of: admin, organizer, volunteer.');
  }
  if (!password || password.length < 8) {
    throw new Error('password must be at least 8 characters.');
  }

  return {
    fullName,
    email,
    role,
    phone: phoneRaw.length > 0 ? phoneRaw : null,
    password,
  };
}

router.get('/admin/notifications', requireAuth, requireAdmin, async (req, res) => {
  const requestedLimit = Number(req.query.limit ?? 100);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 300)
    : 100;
  const unreadOnly = String(req.query.unread ?? 'false').toLowerCase() === 'true';
  const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
  const type = typeof req.query.type === 'string' ? req.query.type.trim().toLowerCase() : '';

  if (userId && !isUuid(userId)) {
    res.status(400).json({ message: 'userId must be a valid UUID.' });
    return;
  }

  try {
    const notifications = await listNotificationsForAdmin({
      limit,
      unreadOnly,
      userId,
      type,
    });
    res.json({ notifications });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load admin notifications.';
    res.status(500).json({ message });
  }
});

router.post('/admin/notifications', requireAuth, requireAdmin, async (req, res) => {
  let payload;
  try {
    payload = normalizeNotificationPayload(req.body);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid payload.' });
    return;
  }

  if (!payload.userId || !isUuid(payload.userId)) {
    res.status(400).json({ message: 'userId is required and must be a valid UUID.' });
    return;
  }

  try {
    const notification = await createNotificationRecord({
      userId: payload.userId,
      title: payload.title,
      message: payload.message,
      type: payload.type,
      data: payload.data,
    });
    res.status(201).json({ notification });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create admin notification.';
    res.status(500).json({ message });
  }
});

router.put('/admin/notifications/:id', requireAuth, requireAdmin, async (req, res) => {
  const notificationId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!isUuid(notificationId)) {
    res.status(400).json({ message: 'Notification id must be a valid UUID.' });
    return;
  }

  let payload;
  try {
    payload = normalizeNotificationUpdatePayload(req.body);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid payload.' });
    return;
  }

  if (Object.hasOwn(payload, 'userId') && !isUuid(payload.userId)) {
    res.status(400).json({ message: 'userId must be a valid UUID.' });
    return;
  }

  try {
    const notification = await updateNotificationRecord({
      notificationId,
      updates: payload,
    });
    res.json({ notification });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update admin notification.';
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 500;
    res.status(statusCode).json({ message });
  }
});

router.delete('/admin/notifications/:id', requireAuth, requireAdmin, async (req, res) => {
  const notificationId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!isUuid(notificationId)) {
    res.status(400).json({ message: 'Notification id must be a valid UUID.' });
    return;
  }

  try {
    const notification = await deleteNotificationRecord(notificationId);
    res.json({ success: true, notification });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete admin notification.';
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 500;
    res.status(statusCode).json({ message });
  }
});

router.get('/admin/users', requireAuth, requireAdmin, async (req, res) => {
  const roleFilter = typeof req.query.role === 'string' ? req.query.role : 'all';
  const statusFilter = typeof req.query.status === 'string' ? req.query.status : 'all';
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

  if (roleFilter !== 'all' && !validRoles.has(roleFilter)) {
    res.status(400).json({ message: 'Invalid role filter.' });
    return;
  }
  if (statusFilter !== 'all' && !validUserStatuses.has(statusFilter)) {
    res.status(400).json({ message: 'Invalid status filter.' });
    return;
  }

  try {
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

    const emailByUserId = await buildAuthEmailIndex();
    const usersWithEmails = attachAuthEmailsToUsers(data ?? [], emailByUserId);
    const users = usersWithEmails.filter((user) => {
      if (!search) {
        return true;
      }

      return (
        String(user.id).toLowerCase().includes(search) ||
        String(user.full_name ?? '').toLowerCase().includes(search) ||
        String(user.phone ?? '').toLowerCase().includes(search) ||
        String(user.email ?? '').toLowerCase().includes(search)
      );
    });

    res.json({ users });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to load users.' });
  }
});

router.post('/admin/users', requireAuth, requireAdmin, async (req, res) => {
  let payload;
  try {
    payload = normalizeAdminCreateUserPayload(req.body);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid payload.' });
    return;
  }

  let authUserId = null;

  try {
    const { data: authCreateData, error: authCreateError } = await supabaseAdmin.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: {
        role: payload.role,
        full_name: payload.fullName,
        phone: payload.phone,
      },
    });

    if (authCreateError) {
      const normalizedMessage = authCreateError.message.toLowerCase();
      if (normalizedMessage.includes('already') || normalizedMessage.includes('exists')) {
        res.status(409).json({ message: 'A user with this email already exists.' });
        return;
      }

      const statusCode = Number.isInteger(authCreateError.status) ? authCreateError.status : 500;
      res.status(statusCode).json({ message: authCreateError.message });
      return;
    }

    authUserId = authCreateData?.user?.id ?? null;
    if (!authUserId) {
      res.status(500).json({ message: 'Failed to create auth user.' });
      return;
    }

    const { data: createdUser, error: createUserError } = await supabaseAdmin
      .from('users')
      .insert({
        id: authUserId,
        role: payload.role,
        full_name: payload.fullName,
        phone: payload.phone,
        status: 'active',
      })
      .select(userColumns)
      .single();

    if (createUserError || !createdUser) {
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
      const message = createUserError?.message ?? 'Failed to create user profile.';
      res.status(500).json({ message });
      return;
    }

    if (payload.role === 'volunteer') {
      const { error: volunteerError } = await supabaseAdmin.from('volunteer_profiles').upsert(
        {
          user_id: authUserId,
          skills: [],
          interests: [],
          available_choices: [],
          total_hours: 0,
        },
        { onConflict: 'user_id' }
      );

      if (volunteerError) {
        await supabaseAdmin.from('users').delete().eq('id', authUserId);
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
        res.status(500).json({ message: volunteerError.message });
        return;
      }
    }

    res.status(201).json({
      message: 'User created successfully.',
      user: {
        ...createdUser,
        email: payload.email,
      },
    });
  } catch (error) {
    if (authUserId) {
      await supabaseAdmin.from('users').delete().eq('id', authUserId);
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
    }

    res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to create user.',
    });
  }
});

router.patch('/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const targetUserId = req.params.id;
  const nextRole = req.body?.role;
  const nextStatus = typeof req.body?.status === 'string' ? req.body.status.trim().toLowerCase() : undefined;

  if (!isUuid(targetUserId)) {
    res.status(400).json({ message: 'User id must be a valid UUID.' });
    return;
  }
  if (nextRole && !validRoles.has(nextRole)) {
    res.status(400).json({ message: 'Invalid role value.' });
    return;
  }
  if (nextStatus && !validUserStatuses.has(nextStatus)) {
    res.status(400).json({ message: 'Invalid status value.' });
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

  try {
    const emailByUserId = await buildAuthEmailIndex();
    const [user] = attachAuthEmailsToUsers([data], emailByUserId);
    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to load updated user email.' });
  }
});

router.delete('/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const targetUserId = req.params.id;

  if (!targetUserId || !isUuid(targetUserId)) {
    res.status(400).json({ message: 'User id must be a valid UUID.' });
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
