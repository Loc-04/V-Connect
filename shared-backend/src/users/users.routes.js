import { Router } from 'express';
import { userColumns, volunteerColumns } from '../config/constants.js';
import { isPlainObject, normalizeStringArray } from '../common/utils/validators.js';
import {
  buildAvailabilitySlotsPayload,
  expandLegacyAvailability,
  normalizeAvailableChoicesInput,
  serializeVolunteerProfile,
} from '../common/utils/availability.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { supabaseAdmin } from '../database/supabase.js';
import { getVolunteerProfileByUserId } from './users.service.js';

const router = Router();

function extractVolunteerProfileUpdates(body, { requireAtLeastOne = false } = {}) {
  if (!isPlainObject(body)) {
    throw new Error('Body must be a JSON object.');
  }

  const updates = {};

  if (Object.hasOwn(body, 'skills')) {
    updates.skills = normalizeStringArray(body.skills, 'skills');
  }

  if (Object.hasOwn(body, 'interests')) {
    updates.interests = normalizeStringArray(body.interests, 'interests');
  }

  if (Object.hasOwn(body, 'availableChoices') || Object.hasOwn(body, 'available_choices')) {
    const rawChoices = Object.hasOwn(body, 'availableChoices') ? body.availableChoices : body.available_choices;
    updates.available_choices = normalizeAvailableChoicesInput(rawChoices);
  }

  if (Object.hasOwn(body, 'availability')) {
    updates.available_choices = expandLegacyAvailability(body.availability);
  }

  if (requireAtLeastOne && Object.keys(updates).length === 0) {
    throw new Error('At least one field is required: skills, interests, availableChoices.');
  }

  return updates;
}

async function upsertVolunteerProfile(userId, updates) {
  const { data, error } = await supabaseAdmin
    .from('volunteer_profiles')
    .upsert(
      {
        user_id: userId,
        ...updates,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select(volunteerColumns)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}

function buildSkillsAvailabilityResponse(userId, volunteerProfile) {
  const serialized = serializeVolunteerProfile(volunteerProfile);
  return {
    userId,
    skills: serialized?.skills ?? [],
    interests: serialized?.interests ?? [],
    availableChoices: serialized?.availableChoices ?? [],
    updatedAt: serialized?.updated_at ?? null,
  };
}

router.get('/profile/me', requireAuth, async (req, res) => {
  try {
    let volunteerProfile = null;
    if (req.auth?.profile?.role === 'volunteer') {
      volunteerProfile = serializeVolunteerProfile(await getVolunteerProfileByUserId(req.auth.user.id));
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

router.get('/profile/skills-availability', requireAuth, async (req, res) => {
  if (req.auth?.profile?.role !== 'volunteer') {
    res.status(403).json({ message: 'Volunteer role required.' });
    return;
  }

  try {
    const volunteerProfile = await getVolunteerProfileByUserId(req.auth.user.id);
    res.json({
      skillsAvailability: buildSkillsAvailabilityResponse(req.auth.user.id, volunteerProfile),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load skills and availability.';
    res.status(500).json({ message });
  }
});

router.put('/profile/skills-availability', requireAuth, async (req, res) => {
  if (req.auth?.profile?.role !== 'volunteer') {
    res.status(403).json({ message: 'Volunteer role required.' });
    return;
  }

  let volunteerUpdates;
  try {
    volunteerUpdates = extractVolunteerProfileUpdates(req.body ?? {}, { requireAtLeastOne: true });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid payload.' });
    return;
  }

  try {
    const volunteerProfile = await upsertVolunteerProfile(req.auth.user.id, volunteerUpdates);
    res.json({
      skillsAvailability: buildSkillsAvailabilityResponse(req.auth.user.id, volunteerProfile),
      message: 'Skills and availability updated successfully.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update skills and availability.';
    res.status(500).json({ message });
  }
});

router.get('/availability-slots', requireAuth, (_req, res) => {
  res.json(buildAvailabilitySlotsPayload());
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

  let volunteerUpdates = {};
  try {
    volunteerUpdates = extractVolunteerProfileUpdates(body);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid volunteer profile payload.' });
    return;
  }

  const hasUserUpdates = Object.keys(userUpdates).length > 0;
  const hasVolunteerUpdates = Object.keys(volunteerUpdates).length > 0;

  if (!hasUserUpdates && !hasVolunteerUpdates) {
    res.status(400).json({ message: 'No valid fields to update.' });
    return;
  }

  if (hasVolunteerUpdates && req.auth.profile.role !== 'volunteer') {
    res.status(403).json({ message: 'Only volunteer profiles can update skills/interests/availableChoices.' });
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
        volunteerProfile = await upsertVolunteerProfile(req.auth.user.id, volunteerUpdates);
      } else {
        volunteerProfile = await getVolunteerProfileByUserId(req.auth.user.id);
      }
      volunteerProfile = serializeVolunteerProfile(volunteerProfile);
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
