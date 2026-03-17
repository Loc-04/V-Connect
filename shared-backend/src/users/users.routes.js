import { Router } from 'express';
import { userColumns, volunteerColumns } from '../config/constants.js';
import { isPlainObject, normalizeStringArray } from '../common/utils/validators.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { supabaseAdmin } from '../database/supabase.js';
import { getVolunteerProfileByUserId } from './users.service.js';

const router = Router();

router.get('/profile/me', requireAuth, async (req, res) => {
  try {
    let volunteerProfile = null;
    if (req.auth?.profile?.role === 'volunteer') {
      volunteerProfile = await getVolunteerProfileByUserId(req.auth.user.id);
    }

    res.json({
      profile: req.auth.profile,
      volunteerProfile,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load profile.';
    res.status(500).json({ message });
  }
});

router.patch('/profile/me', requireAuth, async (req, res) => {
  const body = req.body ?? {};

  if (!isPlainObject(body)) {
    res.status(400).json({ message: 'Body must be a JSON object.' });
    return;
  }

  if (!req.auth?.profile) {
    res.status(404).json({ message: 'Profile not found in public.users.' });
    return;
  }

  const userUpdates = {};

  if (Object.hasOwn(body, 'fullName')) {
    if (typeof body.fullName !== 'string') {
      res.status(400).json({ message: 'fullName must be a string.' });
      return;
    }
    const fullName = body.fullName.trim();
    if (!fullName) {
      res.status(400).json({ message: 'fullName cannot be empty.' });
      return;
    }
    userUpdates.full_name = fullName;
  }

  if (Object.hasOwn(body, 'phone')) {
    if (typeof body.phone !== 'string') {
      res.status(400).json({ message: 'phone must be a string.' });
      return;
    }
    const phone = body.phone.trim();
    if (!phone) {
      res.status(400).json({ message: 'phone cannot be empty.' });
      return;
    }
    userUpdates.phone = phone;
  }

  if (Object.hasOwn(body, 'avatarUrl')) {
    const avatarUrl = body.avatarUrl;
    if (avatarUrl !== null && typeof avatarUrl !== 'string') {
      res.status(400).json({ message: 'avatarUrl must be a string or null.' });
      return;
    }

    if (typeof avatarUrl === 'string' && avatarUrl.trim().length > 0) {
      try {
        const parsed = new URL(avatarUrl.trim());
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          res.status(400).json({ message: 'avatarUrl must use http or https.' });
          return;
        }
      } catch {
        res.status(400).json({ message: 'avatarUrl is not a valid URL.' });
        return;
      }
      userUpdates.avatar_url = avatarUrl.trim();
    } else {
      userUpdates.avatar_url = null;
    }
  }

  const volunteerUpdates = {};

  if (Object.hasOwn(body, 'skills')) {
    try {
      volunteerUpdates.skills = normalizeStringArray(body.skills, 'skills');
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid skills.' });
      return;
    }
  }

  if (Object.hasOwn(body, 'interests')) {
    try {
      volunteerUpdates.interests = normalizeStringArray(body.interests, 'interests');
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid interests.' });
      return;
    }
  }

  if (Object.hasOwn(body, 'availability')) {
    const availability = body.availability;
    if (!isPlainObject(availability)) {
      res.status(400).json({ message: 'availability must be an object.' });
      return;
    }

    const availabilityKeys = ['weekdays', 'weekends', 'evenings'];
    for (const key of availabilityKeys) {
      if (!Object.hasOwn(availability, key) || typeof availability[key] !== 'boolean') {
        res.status(400).json({ message: `availability.${key} must be a boolean.` });
        return;
      }
    }

    volunteerUpdates.availability = {
      weekdays: availability.weekdays,
      weekends: availability.weekends,
      evenings: availability.evenings,
    };
  }

  const hasUserUpdates = Object.keys(userUpdates).length > 0;
  const hasVolunteerUpdates = Object.keys(volunteerUpdates).length > 0;

  if (!hasUserUpdates && !hasVolunteerUpdates) {
    res.status(400).json({ message: 'No valid fields to update.' });
    return;
  }

  if (hasVolunteerUpdates && req.auth.profile.role !== 'volunteer') {
    res.status(403).json({ message: 'Only volunteer profiles can update skills/interests/availability.' });
    return;
  }

  try {
    let profile = req.auth.profile;

    if (hasUserUpdates) {
      const { data, error } = await supabaseAdmin
        .from('users')
        .update({ ...userUpdates, updated_at: new Date().toISOString() })
        .eq('id', req.auth.user.id)
        .is('deleted_at', null)
        .select(userColumns)
        .maybeSingle();

      if (error) {
        res.status(500).json({ message: error.message });
        return;
      }

      if (!data) {
        res.status(404).json({ message: 'Profile not found.' });
        return;
      }

      profile = data;
    }

    let volunteerProfile = null;
    if (req.auth.profile.role === 'volunteer') {
      if (hasVolunteerUpdates) {
        const { data, error } = await supabaseAdmin
          .from('volunteer_profiles')
          .upsert(
            {
              user_id: req.auth.user.id,
              ...volunteerUpdates,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          )
          .select(volunteerColumns)
          .maybeSingle();

        if (error) {
          res.status(500).json({ message: error.message });
          return;
        }

        volunteerProfile = data ?? null;
      } else {
        volunteerProfile = await getVolunteerProfileByUserId(req.auth.user.id);
      }
    }

    res.json({
      profile,
      volunteerProfile,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update profile.';
    res.status(500).json({ message });
  }
});

export default router;
