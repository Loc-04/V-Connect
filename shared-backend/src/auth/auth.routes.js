import { Router } from 'express';
import { PASSWORD_RESET_REDIRECT_TO } from '../config/env.js';
import { validRoles } from '../config/constants.js';
import { isValidEmail } from '../common/utils/validators.js';
import { supabaseAdmin } from '../database/supabase.js';
import { requireAuth } from './auth.middleware.js';
import { getProfileByUserId } from '../users/users.service.js';
import { normalizeProfileSeedPayload, normalizeRegistrationPayload } from './auth.validation.js';

const router = Router();
const AUTH_USERS_PAGE_SIZE = 1000;

function createRouteRateLimiter({ windowMs, limit }) {
  const bucket = new Map();

  return (req, res, next) => {
    const forwardedFor = typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : '';
    const ipFromHeader = forwardedFor.split(',')[0]?.trim();
    const key = ipFromHeader || req.ip || 'unknown';
    const now = Date.now();

    if (bucket.size > 10_000) {
      for (const [bucketKey, bucketValue] of bucket.entries()) {
        if (bucketValue.resetAt <= now) {
          bucket.delete(bucketKey);
        }
      }
    }

    const current = bucket.get(key);
    if (!current || current.resetAt <= now) {
      bucket.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (current.count >= limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({ message: 'Too many registration attempts. Please try again later.' });
      return;
    }

    current.count += 1;
    bucket.set(key, current);
    next();
  };
}

const registerRateLimiter = createRouteRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
});

async function authEmailExists(email) {
  let page = 1;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: AUTH_USERS_PAGE_SIZE,
    });

    if (error) {
      throw new Error(error.message);
    }

    const users = data?.users ?? [];
    const found = users.some((user) => String(user.email ?? '').trim().toLowerCase() === email);
    if (found) {
      return true;
    }

    if (users.length < AUTH_USERS_PAGE_SIZE) {
      return false;
    }

    page += 1;
  }
}

function isDuplicatePhoneError(errorMessage) {
  const normalized = String(errorMessage ?? '').toLowerCase();
  return normalized.includes('phone') && (normalized.includes('duplicate') || normalized.includes('users_phone_key'));
}

function isDuplicateAuthEmailError(errorMessage) {
  const normalized = String(errorMessage ?? '').toLowerCase();
  return normalized.includes('email') && (normalized.includes('already') || normalized.includes('duplicate'));
}

router.post('/auth/register', registerRateLimiter, async (req, res) => {
  let payload;
  try {
    payload = normalizeRegistrationPayload(req.body);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid registration payload.' });
    return;
  }

  if (payload.role !== 'volunteer') {
    res.status(403).json({ message: 'Public self-signup can only create volunteer accounts.' });
    return;
  }

  try {
    const [emailExists, phoneLookup] = await Promise.all([
      authEmailExists(payload.email),
      supabaseAdmin.from('users').select('id').eq('phone', payload.phone).limit(1).maybeSingle(),
    ]);

    if (emailExists) {
      res.status(409).json({ message: 'Email already exists' });
      return;
    }

    if (phoneLookup.error) {
      res.status(500).json({ message: phoneLookup.error.message });
      return;
    }

    if (phoneLookup.data) {
      res.status(409).json({ message: 'Phone number already exists' });
      return;
    }

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
      if (isDuplicateAuthEmailError(authCreateError.message)) {
        res.status(409).json({ message: 'Email already exists' });
        return;
      }

      const statusCode = Number.isInteger(authCreateError.status) ? authCreateError.status : 500;
      res.status(statusCode).json({ message: 'Unable to create account right now. Please try again.' });
      return;
    }

    const userId = authCreateData?.user?.id ?? null;
    if (!userId) {
      res.status(500).json({ message: 'Unable to create account right now. Please try again.' });
      return;
    }

    const { data: userProfile, error: userProfileError } = await supabaseAdmin
      .from('users')
      .upsert(
        {
          id: userId,
          role: payload.role,
          full_name: payload.fullName,
          phone: payload.phone,
          status: 'active',
          deleted_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
      .select('id, role, full_name, phone, avatar_url, status, created_at, updated_at, deleted_at')
      .single();

    if (userProfileError || !userProfile) {
      await supabaseAdmin.auth.admin.deleteUser(userId);

      if (isDuplicatePhoneError(userProfileError?.message)) {
        res.status(409).json({ message: 'Phone number already exists' });
        return;
      }

      res.status(500).json({ message: 'Unable to create account right now. Please try again.' });
      return;
    }

    const { error: volunteerProfileError } = await supabaseAdmin.from('volunteer_profiles').upsert(
      {
        user_id: userId,
        skills: [],
        interests: [],
        available_choices: [],
        total_hours: 0,
      },
      { onConflict: 'user_id' }
    );

    if (volunteerProfileError) {
      await supabaseAdmin.from('users').delete().eq('id', userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      res.status(500).json({ message: 'Unable to create account right now. Please try again.' });
      return;
    }

    res.status(201).json({
      success: true,
      requiresEmailConfirmation: false,
      profile: userProfile,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create account.';
    res.status(500).json({ message });
  }
});

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
  let profileSeed;
  try {
    profileSeed = normalizeProfileSeedPayload(req.body);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid profile payload.' });
    return;
  }

  const { role, fullName, phone } = profileSeed;
  const requesterRole = String(req.auth?.profile?.role ?? '')
    .trim()
    .toLowerCase();

  if (!validRoles.has(role)) {
    res.status(400).json({ message: 'Invalid role.' });
    return;
  }

  if (requesterRole !== 'admin' && role !== 'volunteer') {
    res.status(403).json({ message: 'Public self-signup can only create volunteer accounts.' });
    return;
  }

  if (role === 'admin' && req.auth?.profile?.role !== 'admin') {
    res.status(403).json({ message: 'You cannot self-assign admin role.' });
    return;
  }

  const { data: existingPhoneOwner, error: phoneLookupError } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('phone', phone)
    .neq('id', req.auth.user.id)
    .limit(1)
    .maybeSingle();

  if (phoneLookupError) {
    res.status(500).json({ message: phoneLookupError.message });
    return;
  }

  if (existingPhoneOwner) {
    res.status(409).json({ message: 'Phone number already exists' });
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
    if (isDuplicatePhoneError(upsertError.message)) {
      res.status(409).json({ message: 'Phone number already exists' });
      return;
    }

    res.status(500).json({ message: upsertError.message });
    return;
  }

  if (role === 'volunteer') {
    const { error: volunteerError } = await supabaseAdmin.from('volunteer_profiles').upsert(
      {
        user_id: req.auth.user.id,
        skills: [],
        interests: [],
        available_choices: [],
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
