import { Router } from 'express';
import { PASSWORD_RESET_REDIRECT_TO } from '../config/env.js';
import { validRoles } from '../config/constants.js';
import { isValidEmail } from '../common/utils/validators.js';
import { supabaseAdmin } from '../database/supabase.js';
import { requireAuth } from './auth.middleware.js';
import { getProfileByUserId } from '../users/users.service.js';

const router = Router();

router.post('/auth/reset-password', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

  if (!email) {
    res.status(400).json({ message: 'email is required.' });
    return;
  }

  if (!isValidEmail(email)) {
    res.status(400).json({ message: 'email must be a valid email address.' });
    return;
  }

  try {
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: PASSWORD_RESET_REDIRECT_TO,
    });

    if (error) {
      const statusCode = Number.isInteger(error.status) ? error.status : 500;
      res.status(statusCode).json({ message: error.message });
      return;
    }

    res.json({
      success: true,
      message: 'If the email is registered, a password reset link has been sent.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send reset password email.';
    res.status(500).json({ message });
  }
});

router.get('/auth/me', requireAuth, (req, res) => {
  res.json({
    profile: req.auth.profile,
    auth: {
      id: req.auth.user.id,
      email: req.auth.user.email ?? null,
    },
  });
});

router.post('/auth/register-profile', requireAuth, async (req, res) => {
  const role = req.body?.role;
  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';

  if (!validRoles.has(role)) {
    res.status(400).json({ message: 'Invalid role.' });
    return;
  }
  if (role === 'admin' && req.auth?.profile?.role !== 'admin') {
    res.status(403).json({ message: 'You cannot self-assign admin role.' });
    return;
  }

  if (!fullName || !phone) {
    res.status(400).json({ message: 'fullName and phone are required.' });
    return;
  }

  const { error: upsertError } = await supabaseAdmin.from('users').upsert(
    {
      id: req.auth.user.id,
      role,
      full_name: fullName,
      phone,
      status: 'active',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (upsertError) {
    res.status(500).json({ message: upsertError.message });
    return;
  }

  if (role === 'volunteer') {
    const { error: volunteerError } = await supabaseAdmin.from('volunteer_profiles').upsert(
      {
        user_id: req.auth.user.id,
        skills: [],
        interests: [],
        availability: {
          weekdays: false,
          weekends: false,
          evenings: false,
        },
        total_hours: 0,
      },
      { onConflict: 'user_id' }
    );

    if (volunteerError) {
      res.status(500).json({ message: volunteerError.message });
      return;
    }
  }

  const profile = await getProfileByUserId(req.auth.user.id);
  res.json({ profile });
});

export default router;
