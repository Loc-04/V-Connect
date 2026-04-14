import { supabaseAdmin } from '../database/supabase.js';
import { computeDurationHours, getActivityById } from '../activities/activities.service.js';
import { getProfileByUserId } from '../users/users.service.js';
import { isPlainObject } from '../common/utils/validators.js';
import {
  buildAvailableChoicesSummary,
  computeAvailabilityMatch,
  getAvailableChoices,
} from '../common/utils/availability.js';

function normalizeStringSet(values) {
  if (!Array.isArray(values)) {
    return new Set();
  }

  return new Set(
    values
      .map((value) => String(value).trim().toLowerCase())
      .filter((value) => value.length > 0)
  );
}

function getActivityText(activity) {
  const locationText = isPlainObject(activity?.location)
    ? [activity.location.address, activity.location.city].filter(Boolean).join(' ')
    : String(activity?.location ?? '');

  return [activity?.title, activity?.description, locationText, ...(Array.isArray(activity?.required_skills) ? activity.required_skills : [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function uniqueReasons(reasons) {
  return Array.from(new Set(reasons.filter((reason) => String(reason).trim().length > 0)));
}

function scoreActivityForVolunteerProfile({ activity, profile, hasOrganizerHistory = false }) {
  const requiredSkills = normalizeStringSet(activity?.required_skills);
  const volunteerSkills = normalizeStringSet(profile?.skills);
  const interests = normalizeStringSet(profile?.interests);
  const activityText = getActivityText(activity);

  const matchedSkills = Array.from(requiredSkills).filter((skill) => volunteerSkills.has(skill));
  const matchedInterests = Array.from(interests).filter((interest) => activityText.includes(interest));
  const availabilityMatch = computeAvailabilityMatch(profile?.available_choices, activity?.start_time, activity?.end_time);

  let skillScore = 0;
  if (requiredSkills.size === 0) {
    skillScore = volunteerSkills.size > 0 ? 15 : 5;
  } else if (matchedSkills.length > 0) {
    skillScore = Math.round((matchedSkills.length / requiredSkills.size) * 50);
  }

  const interestScore = interests.size > 0 && matchedInterests.length > 0 ? Math.round((matchedInterests.length / interests.size) * 20) : 0;
  const totalHours = Number(profile?.total_hours ?? 0);
  const experienceScore = Math.max(0, Math.min(10, Math.round(totalHours / 10)));
  const organizerHistoryScore = hasOrganizerHistory ? 5 : 0;

  const reasons = [];
  if (matchedSkills.length > 0) {
    reasons.push(`Matched ${matchedSkills.length}/${requiredSkills.size} required skills`);
  } else if (requiredSkills.size === 0 && volunteerSkills.size > 0) {
    reasons.push('No required skills listed, volunteer profile still has relevant skills');
  }

  if (matchedInterests.length > 0) {
    reasons.push(`Interest overlap: ${matchedInterests.slice(0, 2).join(', ')}`);
  }

  reasons.push(...availabilityMatch.reasons);

  if (experienceScore > 0) {
    reasons.push(`Volunteer has ${totalHours} recorded hours`);
  }

  if (hasOrganizerHistory) {
    reasons.push('Prior participation with this organizer');
  }

  const matchScore = Math.max(
    0,
    Math.min(100, skillScore + interestScore + availabilityMatch.score + experienceScore + organizerHistoryScore)
  );

  return {
    matchScore,
    matchRatio: Number((matchScore / 100).toFixed(2)),
    reasons: uniqueReasons(reasons).slice(0, 4),
    explanation:
      uniqueReasons(reasons).slice(0, 2).join('. ') ||
      'Calculated from volunteer skills, interests, availability, and prior activity history.',
  };
}

async function getOrganizerNamesByIds(organizerIds) {
  if (!Array.isArray(organizerIds) || organizerIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabaseAdmin.from('users').select('id, full_name').in('id', organizerIds);
  if (error) {
    throw new Error(error.message);
  }

  return new Map((data ?? []).map((row) => [row.id, row.full_name]));
}

async function getVolunteerHistoryContext(volunteerId) {
  const { data, error } = await supabaseAdmin
    .from('activity_participations')
    .select('activity_id, status')
    .eq('volunteer_id', volunteerId)
    .limit(500);

  if (error) {
    throw new Error(error.message);
  }

  const registeredActivityIds = new Set();
  const successfulActivityIds = [];
  for (const row of data ?? []) {
    if (row.activity_id) {
      registeredActivityIds.add(row.activity_id);
    }
    if (row.activity_id && ['approved', 'checked_in'].includes(String(row.status ?? ''))) {
      successfulActivityIds.push(row.activity_id);
    }
  }

  if (successfulActivityIds.length === 0) {
    return {
      registeredActivityIds,
      organizerHistoryIds: new Set(),
    };
  }

  const { data: activities, error: activitiesError } = await supabaseAdmin
    .from('activities')
    .select('id, organizer_id')
    .in('id', successfulActivityIds);

  if (activitiesError) {
    throw new Error(activitiesError.message);
  }

  return {
    registeredActivityIds,
    organizerHistoryIds: new Set((activities ?? []).map((row) => row.organizer_id).filter(Boolean)),
  };
}

async function getVolunteerProfileBundle(volunteerId) {
  const [user, volunteerProfile] = await Promise.all([
    getProfileByUserId(volunteerId),
    supabaseAdmin
      .from('volunteer_profiles')
      .select('user_id, skills, interests, available_choices, total_hours')
      .eq('user_id', volunteerId)
      .maybeSingle(),
  ]);

  if (volunteerProfile.error) {
    throw new Error(volunteerProfile.error.message);
  }

  return {
    user,
    profile: volunteerProfile.data ?? {
      user_id: volunteerId,
      skills: [],
      interests: [],
      available_choices: [],
      total_hours: 0,
    },
  };
}

async function listVolunteerCandidates() {
  const { data: users, error: usersError } = await supabaseAdmin
    .from('users')
    .select('id, full_name, avatar_url, role, status')
    .eq('role', 'volunteer')
    .eq('status', 'active')
    .is('deleted_at', null)
    .limit(500);

  if (usersError) {
    throw new Error(usersError.message);
  }

  const volunteerIds = (users ?? []).map((row) => row.id).filter(Boolean);
  if (volunteerIds.length === 0) {
    return [];
  }

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from('volunteer_profiles')
    .select('user_id, skills, interests, available_choices, total_hours')
    .in('user_id', volunteerIds);

  if (profilesError) {
    throw new Error(profilesError.message);
  }

  const profileById = new Map((profiles ?? []).map((row) => [row.user_id, row]));

  return (users ?? []).map((user) => ({
    user,
    profile: profileById.get(user.id) ?? {
      user_id: user.id,
      skills: [],
      interests: [],
      available_choices: [],
      total_hours: 0,
    },
  }));
}

async function getRegisteredVolunteerIdsByActivityIds(activityIds) {
  if (!Array.isArray(activityIds) || activityIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabaseAdmin
    .from('activity_participations')
    .select('activity_id, volunteer_id, status')
    .in('activity_id', activityIds)
    .in('status', ['assigned', 'pending', 'approved', 'checked_in']);

  if (error) {
    throw new Error(error.message);
  }

  const registeredByActivityId = new Map();
  for (const row of data ?? []) {
    if (!row.activity_id || !row.volunteer_id) {
      continue;
    }
    const current = registeredByActivityId.get(row.activity_id) ?? new Set();
    current.add(row.volunteer_id);
    registeredByActivityId.set(row.activity_id, current);
  }

  return registeredByActivityId;
}

async function calculateActivityMatchForVolunteer({ activity, volunteerId }) {
  const [{ profile }, history] = await Promise.all([getVolunteerProfileBundle(volunteerId), getVolunteerHistoryContext(volunteerId)]);

  return scoreActivityForVolunteerProfile({
    activity,
    profile,
    hasOrganizerHistory: history.organizerHistoryIds.has(activity.organizer_id),
  });
}

async function getVolunteerRecommendationsForUser(userId, limit = 10) {
  const [{ user, profile }, history] = await Promise.all([getVolunteerProfileBundle(userId), getVolunteerHistoryContext(userId)]);
  if (!user || user.role !== 'volunteer') {
    const error = new Error('Volunteer user not found.');
    error.statusCode = 404;
    throw error;
  }

  const { data: activities, error } = await supabaseAdmin
    .from('activities')
    .select('id, title, description, cover_image_url, location, start_time, end_time, capacity, required_skills, status, organizer_id')
    .eq('status', 'published')
    .is('deleted_at', null)
    .gte('end_time', new Date().toISOString())
    .order('start_time', { ascending: true })
    .limit(80);

  if (error) {
    throw new Error(error.message);
  }

  const filteredActivities = (activities ?? []).filter((activity) => !history.registeredActivityIds.has(activity.id));
  const organizerNameById = await getOrganizerNamesByIds(
    Array.from(new Set(filteredActivities.map((activity) => activity.organizer_id).filter(Boolean)))
  );

  const recommendations = filteredActivities
    .map((activity) => {
      const score = scoreActivityForVolunteerProfile({
        activity,
        profile,
        hasOrganizerHistory: history.organizerHistoryIds.has(activity.organizer_id),
      });

      return {
        activityId: activity.id,
        title: activity.title,
        organizerId: activity.organizer_id,
        organizerName: organizerNameById.get(activity.organizer_id) ?? 'Organizer',
        matchScore: score.matchScore,
        matchRatio: score.matchRatio,
        reasons: score.reasons,
        explanation: score.explanation,
        location: activity.location,
        coverImageUrl: activity.cover_image_url || null,
        startTime: activity.start_time,
        endTime: activity.end_time,
        hours: computeDurationHours(activity.start_time, activity.end_time),
        requiredSkills: Array.isArray(activity.required_skills) ? activity.required_skills : [],
        status: activity.status,
      };
    })
    .sort((left, right) => right.matchScore - left.matchScore || String(left.startTime).localeCompare(String(right.startTime)))
    .slice(0, limit);

  return {
    userId,
    role: 'volunteer',
    activities: recommendations,
  };
}

async function getVolunteerRecommendationsForActivity(activityId, limit = 10) {
  const activity = await getActivityById(activityId);
  if (!activity) {
    const error = new Error('Activity not found.');
    error.statusCode = 404;
    throw error;
  }

  const [candidates, registeredByActivityId] = await Promise.all([
    listVolunteerCandidates(),
    getRegisteredVolunteerIdsByActivityIds([activityId]),
  ]);

  const registeredVolunteerIds = registeredByActivityId.get(activityId) ?? new Set();

  const volunteers = candidates
    .filter((candidate) => !registeredVolunteerIds.has(candidate.user.id))
    .map((candidate) => {
      const score = scoreActivityForVolunteerProfile({
        activity,
        profile: candidate.profile,
        hasOrganizerHistory: false,
      });

      return {
        userId: candidate.user.id,
        fullName: candidate.user.full_name,
        avatarUrl: candidate.user.avatar_url,
        matchScore: score.matchScore,
        matchRatio: score.matchRatio,
        reasons: score.reasons,
        explanation: score.explanation,
        skills: Array.isArray(candidate.profile.skills) ? candidate.profile.skills : [],
        interests: Array.isArray(candidate.profile.interests) ? candidate.profile.interests : [],
        availableChoices: getAvailableChoices(candidate.profile.available_choices),
        availabilitySummary: buildAvailableChoicesSummary(candidate.profile.available_choices),
        totalHours: Number(candidate.profile.total_hours ?? 0),
      };
    })
    .sort((left, right) => right.matchScore - left.matchScore || left.fullName.localeCompare(right.fullName))
    .slice(0, limit);

  return {
    activity: {
      id: activity.id,
      title: activity.title,
      status: activity.status,
    },
    volunteers,
  };
}

async function getOrganizerRecommendationsForUser(userId, limit = 10) {
  const organizer = await getProfileByUserId(userId);
  if (!organizer || organizer.role !== 'organizer') {
    const error = new Error('Organizer user not found.');
    error.statusCode = 404;
    throw error;
  }

  const { data: activities, error } = await supabaseAdmin
    .from('activities')
    .select('id, title, description, location, start_time, end_time, capacity, required_skills, status, organizer_id')
    .eq('organizer_id', userId)
    .is('deleted_at', null)
    .in('status', ['draft', 'published'])
    .order('start_time', { ascending: true })
    .limit(40);

  if (error) {
    throw new Error(error.message);
  }

  if (!activities || activities.length === 0) {
    return {
      userId,
      role: 'organizer',
      volunteers: [],
    };
  }

  const [candidates, registeredByActivityId] = await Promise.all([
    listVolunteerCandidates(),
    getRegisteredVolunteerIdsByActivityIds(activities.map((activity) => activity.id)),
  ]);

  const bestByVolunteerId = new Map();

  for (const candidate of candidates) {
    for (const activity of activities) {
      const registeredVolunteerIds = registeredByActivityId.get(activity.id) ?? new Set();
      if (registeredVolunteerIds.has(candidate.user.id)) {
        continue;
      }

      const score = scoreActivityForVolunteerProfile({
        activity,
        profile: candidate.profile,
        hasOrganizerHistory: false,
      });

      const previousBest = bestByVolunteerId.get(candidate.user.id);
      if (!previousBest || score.matchScore > previousBest.matchScore) {
        bestByVolunteerId.set(candidate.user.id, {
          userId: candidate.user.id,
          fullName: candidate.user.full_name,
          avatarUrl: candidate.user.avatar_url,
          matchScore: score.matchScore,
          matchRatio: score.matchRatio,
          reasons: score.reasons,
          explanation: score.explanation,
          matchedActivityId: activity.id,
          matchedActivityTitle: activity.title,
          skills: Array.isArray(candidate.profile.skills) ? candidate.profile.skills : [],
          availableChoices: getAvailableChoices(candidate.profile.available_choices),
          availabilitySummary: buildAvailableChoicesSummary(candidate.profile.available_choices),
        });
      }
    }
  }

  return {
    userId,
    role: 'organizer',
    volunteers: Array.from(bestByVolunteerId.values())
      .sort((left, right) => right.matchScore - left.matchScore || left.fullName.localeCompare(right.fullName))
      .slice(0, limit),
  };
}

async function getRecommendationsForUser(userId, limit = 10) {
  const profile = await getProfileByUserId(userId);
  if (!profile) {
    const error = new Error('User not found.');
    error.statusCode = 404;
    throw error;
  }

  if (profile.role === 'volunteer') {
    return getVolunteerRecommendationsForUser(userId, limit);
  }

  if (profile.role === 'organizer') {
    return getOrganizerRecommendationsForUser(userId, limit);
  }

  const error = new Error('Recommendations are available only for volunteer or organizer users.');
  error.statusCode = 400;
  throw error;
}

async function getRecommendationsForActivity(activityId, limit = 10) {
  return getVolunteerRecommendationsForActivity(activityId, limit);
}

export {
  calculateActivityMatchForVolunteer,
  getRecommendationsForUser,
  getRecommendationsForActivity,
};
