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

const MATCH_TIER_STRONG = 'strong_match';
const MATCH_TIER_GOOD = 'good_match';
const MATCH_TIER_POTENTIAL = 'potential_match';
const MATCH_TIER_LOW = 'low_match';

const INTERNAL_RECOMMENDATION_CONTROLLER_VERSION = 'internal-recommendation-controller-v1';
const INTERNAL_RECOMMENDATION_DECISION_POLICY = 'ml_score_plus_profile_fit_policy_v1';
const ACTIVE_PARTICIPATION_STATUSES = new Set(['assigned', 'pending', 'approved', 'checked_in']);

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

function normalizeMatchScore(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function getMatchTier(scoreLike) {
  const score = normalizeMatchScore(scoreLike);
  if (score >= 75) {
    return MATCH_TIER_STRONG;
  }
  if (score >= 50) {
    return MATCH_TIER_GOOD;
  }
  if (score >= 35) {
    return MATCH_TIER_POTENTIAL;
  }
  return MATCH_TIER_LOW;
}

function humanizeReasonCode(code) {
  const dictionary = {
    skills_full_match: 'strong skill alignment',
    skills_partial_match: 'relevant skill alignment',
    skills_not_required_profile_has_skills: 'relevant profile skills',
    interest_overlap: 'interest alignment',
    availability_overlap: 'availability fit',
    experience_signal: 'relevant volunteer experience',
    organizer_history_signal: 'prior organizer history',
  };

  const normalized = String(code ?? '').trim().toLowerCase();
  if (!normalized) {
    return '';
  }
  return dictionary[normalized] ?? normalized.replace(/_/g, ' ');
}

function getReasonsFromScoreBreakdown(scoreBreakdown) {
  if (!scoreBreakdown || typeof scoreBreakdown !== 'object') {
    return [];
  }

  const reasons = [];
  if (Number(scoreBreakdown.skill_score ?? 0) > 0) {
    reasons.push('skill alignment');
  }
  if (Number(scoreBreakdown.interest_score ?? 0) > 0) {
    reasons.push('interest alignment');
  }
  if (Number(scoreBreakdown.availability_score ?? 0) > 0) {
    reasons.push('availability fit');
  }
  if (Number(scoreBreakdown.experience_score ?? 0) > 0) {
    reasons.push('relevant volunteer experience');
  }
  if (Number(scoreBreakdown.history_score ?? 0) > 0) {
    reasons.push('prior organizer history');
  }

  return reasons;
}

function toDisplayReasons(score) {
  const fromReasonCodes = Array.isArray(score?.reason_codes)
    ? score.reason_codes.map((code) => humanizeReasonCode(code)).filter(Boolean)
    : [];
  const fromScoreBreakdown = getReasonsFromScoreBreakdown(score?.score_breakdown);
  const fromReasons = Array.isArray(score?.reasons)
    ? score.reasons.map((reason) => String(reason ?? '').trim()).filter(Boolean)
    : [];

  const merged =
    fromReasonCodes.length > 0
      ? fromReasonCodes
      : fromScoreBreakdown.length > 0
        ? fromScoreBreakdown
        : fromReasons;
  return uniqueReasons(merged).slice(0, 3);
}

function lowerFirst(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    return '';
  }
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function toDisplayExplanation(score) {
  const matchTier = getMatchTier(score?.matchScore ?? score?.score_breakdown?.final_score);
  const reasons = toDisplayReasons(score);
  const primary = reasons[0] ?? '';
  const secondary = reasons[1] ?? '';

  if (reasons.length === 1) {
    return `Recommended mainly because of ${lowerFirst(primary)}.`;
  }

  if (matchTier === MATCH_TIER_STRONG) {
    if (primary && secondary) {
      return `This activity strongly matches your profile, especially ${lowerFirst(primary)} and ${lowerFirst(secondary)}.`;
    }
    return 'This activity strongly matches your skills and interests, and fits your availability.';
  }

  if (matchTier === MATCH_TIER_GOOD) {
    if (primary && secondary) {
      return `This activity matches several parts of your profile, especially ${lowerFirst(primary)} and ${lowerFirst(secondary)}.`;
    }
    return 'This activity matches several parts of your profile, especially your skills and interests.';
  }

  if (matchTier === MATCH_TIER_POTENTIAL) {
    if (primary) {
      return `This activity partially matches your profile, mainly through ${lowerFirst(primary)}.`;
    }
    return 'This activity partially matches your profile, mainly because of availability or interest alignment.';
  }

  if (primary) {
    return `This activity has limited match with your current profile, with only ${lowerFirst(primary)} as a signal.`;
  }

  return 'This activity has limited match with your current profile, so it may be better to explore other options.';
}

function toAiBadgeLabel(score) {
  const provider = String(score?.provider ?? '').trim().toLowerCase();
  const modelKind = String(score?.model_kind ?? '').trim().toLowerCase();
  if (provider === 'external') {
    return 'AI enhanced';
  }
  if (modelKind === 'ml_logistic_regression_v1') {
    return 'Internal ML v1';
  }
  return 'Profile match';
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
  const normalizedScore = normalizeMatchScore(score?.matchScore ?? score?.score_breakdown?.final_score);
  const matchTier = getMatchTier(normalizedScore);
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
    match_tier: matchTier,
    display_explanation: toDisplayExplanation(score),
    display_reasons: toDisplayReasons(score),
    ai_badge_label: toAiBadgeLabel(score),
  };
}

function toRatio(value, maxValue) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || !Number.isFinite(maxValue) || maxValue <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, numeric / maxValue));
}

function roundTwo(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Number(numeric.toFixed(2));
}

function buildDecisionReasons({ scoreBreakdown, displayReasons }) {
  const reasons = Array.isArray(displayReasons)
    ? displayReasons.map((reason) => String(reason ?? '').trim()).filter((reason) => reason.length > 0)
    : [];
  if (reasons.length > 0) {
    return reasons.slice(0, 3);
  }

  const fallback = [];
  if (Number(scoreBreakdown?.skill_score ?? 0) > 0) {
    fallback.push('Skill alignment');
  }
  if (Number(scoreBreakdown?.interest_score ?? 0) > 0) {
    fallback.push('Interest alignment');
  }
  if (Number(scoreBreakdown?.availability_score ?? 0) > 0) {
    fallback.push('Availability fit');
  }
  if (Number(scoreBreakdown?.experience_score ?? 0) > 0) {
    fallback.push('Relevant volunteer experience');
  }
  if (Number(scoreBreakdown?.history_score ?? 0) > 0) {
    fallback.push('Prior organizer history');
  }
  return fallback.slice(0, 3);
}

function buildDecisionExplanation({ decision, recommendationGroup, reasons }) {
  const primary = reasons[0] ? lowerFirst(reasons[0]) : '';
  const secondary = reasons[1] ? lowerFirst(reasons[1]) : '';

  if (decision === 'recommend' && recommendationGroup === 'recommended') {
    if (primary && secondary) {
      return `This activity is recommended because it strongly matches your ${primary} and ${secondary}.`;
    }
    return 'This activity is recommended because it strongly matches your skills, interests, and availability.';
  }

  if (decision === 'recommend') {
    if (primary && secondary) {
      return `This activity is a good match because your ${primary} and ${secondary} align with the activity requirements.`;
    }
    return 'This activity is a good match because several parts of your profile align with the activity requirements.';
  }

  if (decision === 'consider') {
    if (primary) {
      return `This activity may be worth exploring, with partial alignment on ${primary}.`;
    }
    return 'This activity may be worth exploring, but the match is only partial.';
  }

  if (decision === 'ineligible') {
    return 'This activity is currently not eligible for recommendation due to availability or participation constraints.';
  }

  if (primary) {
    return `This activity is not prioritized because ${primary} is limited for your current profile.`;
  }
  return 'This activity is not prioritized because it has limited match with your current skills and interests.';
}

function evaluateActivityEligibility({ activity, activeParticipantCount, volunteerHistory }) {
  const status = String(activity?.status ?? '').trim().toLowerCase();
  const now = Date.now();
  const endTime = new Date(activity?.end_time ?? 0).getTime();
  const capacity = Number(activity?.capacity ?? 0);
  const activityId = String(activity?.id ?? '').trim();
  const isAlreadyJoined = activityId && volunteerHistory?.activeRegisteredActivityIds?.has(activityId);

  if (status !== 'published') {
    return { eligible: false, reason: 'activity_not_published' };
  }
  if (Number.isFinite(endTime) && endTime > 0 && endTime < now) {
    return { eligible: false, reason: 'activity_expired' };
  }
  if (isAlreadyJoined) {
    return { eligible: false, reason: 'already_joined' };
  }
  if (capacity > 0 && activeParticipantCount >= capacity) {
    return { eligible: false, reason: 'activity_full' };
  }
  return { eligible: true, reason: null };
}

function decideRecommendation({
  matchScore,
  scoreBreakdown,
  matchTier,
  modelKind,
  eligibility,
  displayReasons,
}) {
  if (!eligibility.eligible) {
    const reasons = buildDecisionReasons({ scoreBreakdown, displayReasons });
    return {
      decision: 'ineligible',
      recommendation_group: 'ineligible',
      confidence: roundTwo(matchScore / 100),
      primary_recommendation: false,
      cta_label: 'Browse all opportunities',
      priority_label: 'Not eligible',
      decision_reason: eligibility.reason,
      display_reasons: reasons,
      display_explanation: buildDecisionExplanation({
        decision: 'ineligible',
        recommendationGroup: 'ineligible',
        reasons,
      }),
    };
  }

  const skillRatio = toRatio(scoreBreakdown?.skill_score, SKILL_SCORE_MAX);
  const interestRatio = toRatio(scoreBreakdown?.interest_score, INTEREST_SCORE_MAX);
  const availabilityRatio = toRatio(scoreBreakdown?.availability_score, AVAILABILITY_SCORE_MAX);
  const experienceRatio = toRatio(scoreBreakdown?.experience_score, EXPERIENCE_SCORE_MAX);
  const historyRatio = toRatio(scoreBreakdown?.history_score, HISTORY_SCORE_MAX);
  const blendedProfileFit =
    skillRatio * 0.45 +
    interestRatio * 0.2 +
    availabilityRatio * 0.2 +
    experienceRatio * 0.1 +
    historyRatio * 0.05;
  const confidence = roundTwo(Math.max(matchScore / 100, blendedProfileFit));
  const reasons = buildDecisionReasons({ scoreBreakdown, displayReasons });

  let decision = 'not_recommended';
  let recommendationGroup = 'not_recommended';
  let ctaLabel = 'Browse all opportunities';
  let priorityLabel = 'Low match';
  let decisionReason = 'low_profile_match';

  if (matchScore >= 78 && (skillRatio >= 0.4 || (availabilityRatio >= 0.5 && interestRatio >= 0.25))) {
    decision = 'recommend';
    recommendationGroup = 'recommended';
    ctaLabel = 'Join now';
    priorityLabel = 'Best match';
    decisionReason = 'high_skill_and_availability_match';
  } else if (matchScore >= 60 && (skillRatio >= 0.3 || interestRatio >= 0.25 || availabilityRatio >= 0.3)) {
    decision = 'recommend';
    recommendationGroup = 'good_match';
    ctaLabel = 'Join now';
    priorityLabel = 'Good match';
    decisionReason = 'balanced_profile_alignment';
  } else if (
    matchScore >= 45 &&
    (skillRatio >= 0.2 || interestRatio >= 0.2 || availabilityRatio >= 0.2)
  ) {
    decision = 'consider';
    recommendationGroup = 'consider_later';
    ctaLabel = 'Explore option';
    priorityLabel = 'Potential fit';
    decisionReason = 'partial_profile_alignment';
  } else if (
    matchScore >= 35 &&
    (interestRatio >= 0.25 || availabilityRatio >= 0.3)
  ) {
    decision = 'consider';
    recommendationGroup = 'consider_later';
    ctaLabel = 'Explore option';
    priorityLabel = 'Potential fit';
    decisionReason = 'limited_but_promising_signal';
  }

  const effectiveTier =
    decision === 'not_recommended' && matchTier !== MATCH_TIER_LOW ? MATCH_TIER_LOW : matchTier;
  const explanation = buildDecisionExplanation({
    decision,
    recommendationGroup,
    reasons,
  });

  return {
    decision,
    recommendation_group: recommendationGroup,
    confidence,
    primary_recommendation: false,
    cta_label: ctaLabel,
    priority_label: priorityLabel,
    decision_reason: decisionReason,
    match_tier: effectiveTier,
    model_kind: modelKind,
    display_reasons: reasons,
    display_explanation: explanation,
  };
}

function buildCandidateActivityRow({ activity, score, organizerName }) {
  const coverImageUrl = resolveActivityCoverImageUrl(activity.cover_image_url);
  const structured = toStructuredRecommendationFields(score);
  const aiDecision = decideRecommendation({
    matchScore: score.matchScore,
    scoreBreakdown: structured.score_breakdown,
    matchTier: structured.match_tier,
    modelKind: structured.model_kind,
    eligibility: activity.eligibility,
    displayReasons: structured.display_reasons,
  });

  const decisionSnapshot = {
    decision: aiDecision.decision,
    recommendation_group: aiDecision.recommendation_group,
    decision_reason: aiDecision.decision_reason,
    confidence: aiDecision.confidence,
    policy: INTERNAL_RECOMMENDATION_DECISION_POLICY,
  };

  return {
    activity_id: activity.id,
    activityId: activity.id,
    title: activity.title,
    organizerId: activity.organizer_id,
    organizerName: organizerName ?? 'Organizer',
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
    ...structured,
    match_tier: aiDecision.match_tier,
    display_explanation: aiDecision.display_explanation,
    display_reasons: aiDecision.display_reasons,
    ai_decision: aiDecision,
    prediction_snapshot: {
      ...(structured.prediction_snapshot ?? {}),
      ai_decision: decisionSnapshot,
    },
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
  const activeRegisteredActivityIds = new Set();
  const successfulActivityIds = [];
  for (const row of data ?? []) {
    const normalizedStatus = String(row.status ?? '').trim().toLowerCase();
    if (row.activity_id) {
      registeredActivityIds.add(row.activity_id);
    }
    if (row.activity_id && ACTIVE_PARTICIPATION_STATUSES.has(normalizedStatus)) {
      activeRegisteredActivityIds.add(row.activity_id);
    }
    if (row.activity_id && ['approved', 'checked_in'].includes(normalizedStatus)) {
      successfulActivityIds.push(row.activity_id);
    }
  }

  if (successfulActivityIds.length === 0) {
    return {
      registeredActivityIds,
      activeRegisteredActivityIds,
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
    activeRegisteredActivityIds,
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

  const allActivities = Array.isArray(activities) ? activities : [];
  const [organizerNameById, registeredByActivityId] = await Promise.all([
    getOrganizerNamesByIds(Array.from(new Set(allActivities.map((activity) => activity.organizer_id).filter(Boolean)))),
    getRegisteredVolunteerIdsByActivityIds(allActivities.map((activity) => activity.id)),
  ]);

  const candidateRows = allActivities.map((activity) => {
    const activeVolunteerSet = registeredByActivityId.get(activity.id) ?? new Set();
    const eligibility = evaluateActivityEligibility({
      activity,
      activeParticipantCount: activeVolunteerSet.size,
      volunteerHistory: history,
    });

    const score = scoreActivityForVolunteerProfile({
      activity,
      profile,
      hasOrganizerHistory: history.organizerHistoryIds.has(activity.organizer_id),
    });

    return buildCandidateActivityRow({
      activity: {
        ...activity,
        eligibility,
      },
      score,
      organizerName: organizerNameById.get(activity.organizer_id) ?? 'Organizer',
    });
  });

  const decisionOrder = {
    recommend: 0,
    consider: 1,
    not_recommended: 2,
    ineligible: 3,
  };

  candidateRows.sort((left, right) => {
    const leftDecision = String(left?.ai_decision?.decision ?? 'not_recommended');
    const rightDecision = String(right?.ai_decision?.decision ?? 'not_recommended');
    const leftOrder = decisionOrder[leftDecision] ?? 99;
    const rightOrder = decisionOrder[rightDecision] ?? 99;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    const scoreGap = Number(right.matchScore ?? 0) - Number(left.matchScore ?? 0);
    if (scoreGap !== 0) {
      return scoreGap;
    }
    return String(left.startTime ?? '').localeCompare(String(right.startTime ?? ''));
  });

  const selectedRows = candidateRows.filter((row) =>
    ['recommend', 'consider'].includes(String(row?.ai_decision?.decision ?? '').toLowerCase())
  );

  const includedRows = selectedRows
    .slice(0, limit)
    .map((row, index) => ({
      ...row,
      rank_position: index + 1,
      ai_decision: {
        ...row.ai_decision,
        primary_recommendation: false,
      },
    }));

  const primaryIndex = includedRows.findIndex((row) => row.ai_decision?.decision === 'recommend');
  const fallbackPrimaryIndex = primaryIndex === -1 ? 0 : primaryIndex;
  if (includedRows[fallbackPrimaryIndex]) {
    includedRows[fallbackPrimaryIndex] = {
      ...includedRows[fallbackPrimaryIndex],
      ai_decision: {
        ...includedRows[fallbackPrimaryIndex].ai_decision,
        primary_recommendation: true,
        priority_label:
          includedRows[fallbackPrimaryIndex].ai_decision?.decision === 'recommend' ? 'Best match' : 'Consider first',
      },
    };
  }

  const excludedRows = candidateRows
    .filter((row) => !['recommend', 'consider'].includes(String(row?.ai_decision?.decision ?? '').toLowerCase()))
    .map((row) => ({
      activity_id: row.activityId,
      decision: row?.ai_decision?.decision ?? 'not_recommended',
      reason: row?.ai_decision?.decision_reason ?? 'low_profile_match',
      matchScore: row.matchScore,
    }));

  const modelKind = String(includedRows[0]?.model_kind ?? candidateRows[0]?.model_kind ?? 'heuristic').trim() || 'heuristic';
  const modelVersion =
    String(includedRows[0]?.model_version ?? candidateRows[0]?.model_version ?? RECOMMENDATION_MODEL_VERSION).trim() ||
    RECOMMENDATION_MODEL_VERSION;
  const provider =
    String(includedRows[0]?.provider ?? candidateRows[0]?.provider ?? RECOMMENDATION_PROVIDER).trim() ||
    RECOMMENDATION_PROVIDER;
  const recommendedCount = selectedRows.filter((row) => row?.ai_decision?.decision === 'recommend').length;
  const fallbackUsed = modelKind !== 'ml_logistic_regression_v1';

  return {
    userId,
    role: 'volunteer',
    ai_recommendation_session: {
      controller_version: INTERNAL_RECOMMENDATION_CONTROLLER_VERSION,
      model_kind: modelKind,
      model_version: modelVersion,
      provider,
      fallback_used: fallbackUsed,
      candidate_count: candidateRows.length,
      recommended_count: recommendedCount,
      excluded_count: excludedRows.length,
      decision_policy: INTERNAL_RECOMMENDATION_DECISION_POLICY,
    },
    activities: includedRows,
    items: includedRows,
    excluded_items: excludedRows,
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
