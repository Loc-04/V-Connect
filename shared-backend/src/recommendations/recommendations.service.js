import { supabaseAdmin } from '../database/supabase.js';
import { computeDurationHours, getActivityById } from '../activities/activities.service.js';
import { resolveActivityCoverImageUrl } from '../activities/activities.cover.js';
import { getProfileByUserId } from '../users/users.service.js';
import { isPlainObject } from '../common/utils/validators.js';
import {
  buildAvailableChoicesSummary,
  computeAvailabilityMatch,
  getAvailableChoices,
} from '../common/utils/availability.js';
import { scoreWithMlModel } from './recommendation.ml.js';

const RECOMMENDATION_MODEL_VERSION = 'heuristic-v2-lite-2026-04';
const RECOMMENDATION_PROVIDER = 'internal';
const SKILL_SCORE_MAX = 50;
const INTEREST_SCORE_MAX = 20;
const AVAILABILITY_SCORE_MAX = 15;
const EXPERIENCE_SCORE_MAX = 10;
const HISTORY_SCORE_MAX = 5;

const synonymGroups = [
  ['first aid', ['first-aid', 'medical aid', 'basic medical']],
  ['communication', ['communications', 'public speaking', 'facilitation']],
  ['teaching', ['mentoring', 'tutoring', 'coaching']],
  ['logistics', ['operations', 'coordination']],
  ['event planning', ['event organization', 'event management']],
  ['fundraising', ['donation drive', 'resource mobilization']],
  ['environment', ['eco', 'sustainability', 'green']],
  ['healthcare', ['health care', 'medical support']],
];

const synonymLookup = new Map();
for (const [canonical, variants] of synonymGroups) {
  const normalizedCanonical = canonical;
  synonymLookup.set(normalizedCanonical, normalizedCanonical);
  for (const variant of variants) {
    synonymLookup.set(variant, normalizedCanonical);
  }
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'd')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function canonicalizeTerm(rawValue) {
  const normalized = normalizeText(rawValue);
  if (!normalized) {
    return '';
  }
  return synonymLookup.get(normalized) ?? normalized;
}

function normalizeStringSet(values) {
  if (!Array.isArray(values)) {
    return new Set();
  }

  return new Set(
    values
      .map((value) => canonicalizeTerm(value))
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
    .split(' ')
    .map((part) => canonicalizeTerm(part))
    .join(' ')
    .trim();
}

function uniqueReasons(reasons) {
  return Array.from(new Set(reasons.filter((reason) => String(reason).trim().length > 0)));
}

function uniqueCodes(codes) {
  return Array.from(new Set(codes.filter((code) => String(code).trim().length > 0)));
}

function asContribution(feature, score, maxScore, detail) {
  return {
    feature,
    score: Number.isFinite(score) ? Math.max(0, Math.round(score)) : 0,
    max_score: maxScore,
    detail: String(detail ?? '').trim(),
  };
}

function humanizeReasonCode(code) {
  const dictionary = {
    skills_full_match: 'strong skill overlap',
    skills_partial_match: 'relevant skill overlap',
    skills_not_required_profile_has_skills: 'skills still align with activity needs',
    interest_overlap: 'interest overlap',
    availability_overlap: 'availability alignment',
    experience_signal: 'relevant volunteer experience',
    organizer_history_signal: 'prior organizer history',
  };

  const normalized = String(code ?? '').trim().toLowerCase();
  if (!normalized) {
    return '';
  }
  return dictionary[normalized] ?? normalized.replace(/_/g, ' ');
}

function toDisplayReasons(score) {
  const fromReasonCodes = Array.isArray(score?.reason_codes)
    ? score.reason_codes.map((code) => humanizeReasonCode(code)).filter(Boolean)
    : [];
  const fromReasons = Array.isArray(score?.reasons)
    ? score.reasons.map((reason) => String(reason ?? '').trim()).filter(Boolean)
    : [];

  const merged = fromReasonCodes.length > 0 ? fromReasonCodes : fromReasons;
  return uniqueReasons(merged).slice(0, 3);
}

function toDisplayExplanation(score) {
  const modelKind = String(score?.model_kind ?? '').trim().toLowerCase();
  const reasons = toDisplayReasons(score);
  const reasonPhrase = reasons.slice(0, 2).join(' and ');

  if (modelKind === 'heuristic') {
    return reasonPhrase
      ? `Recommended based on profile matching: ${reasonPhrase}.`
      : 'Recommended based on profile matching from skills, interests, availability, and experience signals.';
  }

  return reasonPhrase
    ? `Recommended because your profile aligns on ${reasonPhrase}.`
    : 'Recommended from structured profile and activity matching signals.';
}

function toAiBadgeLabel(score) {
  const modelKind = String(score?.model_kind ?? '').trim().toLowerCase();
  if (modelKind === 'ml_logistic_regression_v1') {
    return 'Internal ML v1';
  }
  return 'Profile Match';
}

function buildGroundedExplanation({ contributions, fallbackText }) {
  const highlights = contributions
    .filter((item) => item.score > 0 && item.detail)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((item) => item.detail);

  if (highlights.length === 0) {
    return fallbackText;
  }

  return `${highlights.join('. ')}. Final match is derived from scored profile/activity signals only.`;
}

function toStructuredRecommendationFields(score) {
  return {
    reason_codes: Array.isArray(score?.reason_codes) ? score.reason_codes : [],
    score_breakdown:
      score?.score_breakdown && typeof score.score_breakdown === 'object' && !Array.isArray(score.score_breakdown)
        ? score.score_breakdown
        : null,
    feature_contributions: Array.isArray(score?.feature_contributions) ? score.feature_contributions : [],
    model_version: String(score?.model_version ?? '').trim() || RECOMMENDATION_MODEL_VERSION,
    provider: String(score?.provider ?? '').trim() || RECOMMENDATION_PROVIDER,
    model_kind: String(score?.model_kind ?? '').trim() || 'heuristic',
    feature_snapshot:
      score?.feature_snapshot && typeof score.feature_snapshot === 'object' && !Array.isArray(score.feature_snapshot)
        ? score.feature_snapshot
        : null,
    prediction_snapshot:
      score?.prediction_snapshot &&
      typeof score.prediction_snapshot === 'object' &&
      !Array.isArray(score.prediction_snapshot)
        ? score.prediction_snapshot
        : null,
    display_explanation: toDisplayExplanation(score),
    display_reasons: toDisplayReasons(score),
    ai_badge_label: toAiBadgeLabel(score),
  };
}

function scoreActivityForVolunteerProfile({ activity, profile, hasOrganizerHistory = false }) {
  const requiredSkills = normalizeStringSet(activity?.required_skills);
  const volunteerSkills = normalizeStringSet(profile?.skills);
  const interests = normalizeStringSet(profile?.interests);
  const activityText = getActivityText(activity);
  const activityTextTokens = new Set(activityText.split(/\s+/).filter(Boolean));

  const matchedSkills = Array.from(requiredSkills).filter((skill) => volunteerSkills.has(skill));
  const matchedInterests = Array.from(interests).filter((interest) => {
    if (activityText.includes(interest)) {
      return true;
    }
    const tokens = interest.split(/\s+/).filter(Boolean);
    return tokens.length > 0 && tokens.every((token) => activityTextTokens.has(token));
  });
  const availabilityMatch = computeAvailabilityMatch(profile?.available_choices, activity?.start_time, activity?.end_time);

  let skillScore = 0;
  if (requiredSkills.size === 0) {
    skillScore = volunteerSkills.size > 0 ? 15 : 5;
  } else if (matchedSkills.length > 0) {
    skillScore = Math.round((matchedSkills.length / requiredSkills.size) * SKILL_SCORE_MAX);
  }

  const interestScore =
    interests.size > 0 && matchedInterests.length > 0
      ? Math.round((matchedInterests.length / interests.size) * INTEREST_SCORE_MAX)
      : 0;
  const totalHours = Number(profile?.total_hours ?? 0);
  const experienceScore = Math.max(0, Math.min(EXPERIENCE_SCORE_MAX, Math.round(totalHours / 10)));
  const organizerHistoryScore = hasOrganizerHistory ? HISTORY_SCORE_MAX : 0;

  const reasons = [];
  const reasonCodes = [];
  if (matchedSkills.length > 0) {
    reasons.push(`Matched ${matchedSkills.length}/${requiredSkills.size} required skills`);
    reasonCodes.push(matchedSkills.length === requiredSkills.size ? 'skills_full_match' : 'skills_partial_match');
  } else if (requiredSkills.size === 0 && volunteerSkills.size > 0) {
    reasons.push('No required skills listed, volunteer profile still has relevant skills');
    reasonCodes.push('skills_not_required_profile_has_skills');
  }

  if (matchedInterests.length > 0) {
    reasons.push(`Interest overlap: ${matchedInterests.slice(0, 2).join(', ')}`);
    reasonCodes.push('interest_overlap');
  }

  if (availabilityMatch.score > 0) {
    reasons.push(...availabilityMatch.reasons);
    reasonCodes.push('availability_overlap');
  }

  if (experienceScore > 0) {
    reasons.push(`Volunteer has ${totalHours} recorded hours`);
    reasonCodes.push('experience_signal');
  }

  if (hasOrganizerHistory) {
    reasons.push('Prior participation with this organizer');
    reasonCodes.push('organizer_history_signal');
  }

  const matchScore = Math.max(
    0,
    Math.min(100, skillScore + interestScore + availabilityMatch.score + experienceScore + organizerHistoryScore)
  );
  const scoreBreakdown = {
    skill_score: skillScore,
    interest_score: interestScore,
    availability_score: availabilityMatch.score,
    experience_score: experienceScore,
    history_score: organizerHistoryScore,
    final_score: matchScore,
  };

  const featureContributions = [
    asContribution(
      'skills',
      skillScore,
      SKILL_SCORE_MAX,
      matchedSkills.length > 0
        ? `${matchedSkills.length}/${Math.max(requiredSkills.size, 1)} required skills matched`
        : requiredSkills.size === 0
          ? 'No strict required skills found; baseline skill contribution applied'
          : 'No required skill overlap found'
    ),
    asContribution(
      'interests',
      interestScore,
      INTEREST_SCORE_MAX,
      matchedInterests.length > 0
        ? `Interest overlap found: ${matchedInterests.slice(0, 2).join(', ')}`
        : 'No direct interest overlap detected'
    ),
    asContribution(
      'availability',
      availabilityMatch.score,
      AVAILABILITY_SCORE_MAX,
      availabilityMatch.score > 0
        ? availabilityMatch.reasons[0] ?? 'Availability overlap detected'
        : 'No availability overlap detected'
    ),
    asContribution(
      'experience',
      experienceScore,
      EXPERIENCE_SCORE_MAX,
      experienceScore > 0 ? `Recorded volunteer hours: ${totalHours}` : 'No experience score contribution yet'
    ),
    asContribution(
      'history',
      organizerHistoryScore,
      HISTORY_SCORE_MAX,
      hasOrganizerHistory ? 'Volunteer has prior participation with this organizer' : 'No prior organizer history signal'
    ),
  ];

  const heuristicResult = {
    matchScore,
    matchRatio: Number((matchScore / 100).toFixed(2)),
    reasons: uniqueReasons(reasons).slice(0, 4),
    reason_codes: uniqueCodes(reasonCodes).slice(0, 6),
    score_breakdown: scoreBreakdown,
    feature_contributions: featureContributions,
    model_version: RECOMMENDATION_MODEL_VERSION,
    provider: RECOMMENDATION_PROVIDER,
    model_kind: 'heuristic',
    explanation: buildGroundedExplanation({
      contributions: featureContributions,
      fallbackText: 'Calculated from volunteer skills, interests, availability, and prior activity history.',
    }),
    feature_snapshot: {
      skill_score: scoreBreakdown.skill_score,
      interest_score: scoreBreakdown.interest_score,
      availability_score: scoreBreakdown.availability_score,
      experience_score: scoreBreakdown.experience_score,
      history_score: scoreBreakdown.history_score,
    },
    prediction_snapshot: {
      strategy: 'heuristic_scoring',
      final_score: matchScore,
    },
  };

  return scoreWithMlModel(heuristicResult);
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
      const coverImageUrl = resolveActivityCoverImageUrl(activity.cover_image_url);
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
        coverImageUrl,
        startTime: activity.start_time,
        endTime: activity.end_time,
        hours: computeDurationHours(activity.start_time, activity.end_time),
        requiredSkills: Array.isArray(activity.required_skills) ? activity.required_skills : [],
        status: activity.status,
        cover_image_url: coverImageUrl,
        ...toStructuredRecommendationFields(score),
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
        ...toStructuredRecommendationFields(score),
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
          interests: Array.isArray(candidate.profile.interests) ? candidate.profile.interests : [],
          availableChoices: getAvailableChoices(candidate.profile.available_choices),
          availabilitySummary: buildAvailableChoicesSummary(candidate.profile.available_choices),
          totalHours: Number(candidate.profile.total_hours ?? 0),
          ...toStructuredRecommendationFields(score),
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
