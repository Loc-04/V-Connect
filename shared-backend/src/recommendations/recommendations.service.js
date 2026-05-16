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
const TOTAL_AVAILABILITY_SLOTS = 21;

const INTERNAL_RECOMMENDATION_CONTROLLER_VERSION = 'internal-recommendation-controller-v1';
const INTERNAL_RECOMMENDATION_DECISION_POLICY = 'ml_score_plus_profile_fit_policy_v1';
const ACTIVE_PARTICIPATION_STATUSES = new Set(['assigned', 'pending', 'approved', 'checked_in']);
const HISTORY_COUNT_FOR_FULL_SIGNAL = Math.max(
  2,
  Math.trunc(Number(process.env.RECOMMENDATION_HISTORY_FULL_SIGNAL_COUNT ?? 4))
);
const RECOMMENDATION_DEBUG = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.RECOMMENDATION_DEBUG ?? '')
    .trim()
    .toLowerCase()
);

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
  if (score >= 30) {
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
    availability_broad_overlap: 'availability broadly overlaps',
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

function normalizeContributionFeatureKey(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z_]/g, '');
  if (!normalized) {
    return '';
  }
  if (normalized.startsWith('skill')) {
    return 'skill';
  }
  if (normalized.startsWith('interest')) {
    return 'interest';
  }
  if (normalized.startsWith('availability')) {
    return 'availability';
  }
  if (normalized.startsWith('experience')) {
    return 'experience';
  }
  if (normalized.startsWith('history')) {
    return 'history';
  }
  return '';
}

function getReasonsFromFeatureContributions(featureContributions, scoreBreakdown, featureSnapshot = null) {
  if (!Array.isArray(featureContributions) || featureContributions.length === 0) {
    return [];
  }

  const hasSkillSignal = Number(scoreBreakdown?.skill_score ?? 0) > 0;
  const hasInterestSignal = Number(scoreBreakdown?.interest_score ?? 0) > 0;
  const hasAvailabilitySignal = Number(scoreBreakdown?.availability_score ?? 0) > 0;
  const hasBroadAvailability = Boolean(featureSnapshot?.availability_is_broad);
  const labelByFeature = {
    skill: 'skill alignment',
    interest: 'interest alignment',
    availability: 'availability fit',
    experience: 'relevant volunteer experience',
    history: 'prior organizer history',
  };

  const minNormalizedContribution = 0.12;
  const minRawContribution = 0.02;
  const ranked = [];

  for (const contribution of featureContributions) {
    const featureKey = normalizeContributionFeatureKey(contribution?.feature);
    const label = labelByFeature[featureKey];
    if (!label) {
      continue;
    }

    if (featureKey === 'skill' && !hasSkillSignal) {
      continue;
    }
    if (featureKey === 'interest' && !hasInterestSignal) {
      continue;
    }
    if (featureKey === 'availability' && !hasAvailabilitySignal) {
      continue;
    }
    if (featureKey === 'availability' && hasBroadAvailability && hasSkillSignal) {
      continue;
    }

    const rawContribution = Number(contribution?.raw_contribution ?? Number.NaN);
    const contributionScore = Number(contribution?.score ?? 0);
    const maxScore = Number(contribution?.max_score ?? 0);
    const normalizedContribution = maxScore > 0 ? contributionScore / maxScore : 0;

    const hasPositiveRawContribution = Number.isFinite(rawContribution) && rawContribution > 0;
    const hasSignificantNormalized = normalizedContribution >= minNormalizedContribution;
    const hasSignificantRaw = hasPositiveRawContribution && rawContribution >= minRawContribution;
    if (!hasSignificantRaw && !hasSignificantNormalized) {
      continue;
    }

    const importance = hasPositiveRawContribution ? rawContribution : normalizedContribution;
    ranked.push({ label, importance });
  }

  ranked.sort((left, right) => right.importance - left.importance);
  return uniqueReasons(ranked.map((item) => item.label)).slice(0, 3);
}

function toDisplayReasons(score) {
  const fromFeatureContributions = getReasonsFromFeatureContributions(
    Array.isArray(score?.feature_contributions) ? score.feature_contributions : [],
    score?.score_breakdown,
    score?.feature_snapshot
  );
  const fromReasonCodes = Array.isArray(score?.reason_codes)
    ? score.reason_codes.map((code) => humanizeReasonCode(code)).filter(Boolean)
    : [];
  const fromScoreBreakdown = getReasonsFromScoreBreakdown(score?.score_breakdown);
  const fromReasons = Array.isArray(score?.reasons)
    ? score.reasons.map((reason) => String(reason ?? '').trim()).filter(Boolean)
    : [];

  const merged =
    fromFeatureContributions.length > 0
      ? fromFeatureContributions
      : fromReasonCodes.length > 0
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
  const hasAvailabilitySignal =
    Number(score?.score_breakdown?.availability_score ?? 0) > 0 ||
    (Array.isArray(score?.reason_codes) && score.reason_codes.includes('availability_overlap'));
  const primary = reasons[0] ?? '';
  const secondary = reasons[1] ?? '';

  if (reasons.length === 1) {
    return `Recommended mainly because of ${lowerFirst(primary)}.`;
  }

  if (matchTier === MATCH_TIER_STRONG) {
    if (primary && secondary) {
      return `This activity strongly matches your profile, especially ${lowerFirst(primary)} and ${lowerFirst(secondary)}.`;
    }
    return hasAvailabilitySignal
      ? 'This activity strongly matches your skills and interests, and fits your availability.'
      : 'This activity strongly matches your skills and interests based on your current profile signals.';
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
    return hasAvailabilitySignal
      ? 'This activity partially matches your profile, mainly because of availability or interest alignment.'
      : 'This activity partially matches your profile, mainly through limited skill or interest alignment.';
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

function parseTimestampMs(value) {
  if (!value) {
    return null;
  }
  const millis = new Date(value).getTime();
  if (!Number.isFinite(millis) || millis <= 0) {
    return null;
  }
  return millis;
}

function resolveHistoryCutoffIso({ participationCreatedAt, activityStartTime }) {
  const participationMs = parseTimestampMs(participationCreatedAt);
  const activityStartMs = parseTimestampMs(activityStartTime);
  if (participationMs && activityStartMs) {
    return new Date(Math.min(participationMs, activityStartMs)).toISOString();
  }
  if (activityStartMs) {
    return new Date(activityStartMs).toISOString();
  }
  if (participationMs) {
    return new Date(participationMs).toISOString();
  }
  return null;
}

function computeHistorySignalRatio(historyCount) {
  const normalizedCount = Math.max(0, Number(historyCount ?? 0));
  if (normalizedCount <= 0) {
    return 0;
  }
  const denominator = Math.log1p(HISTORY_COUNT_FOR_FULL_SIGNAL);
  if (!Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  const ratio = Math.log1p(normalizedCount) / denominator;
  return Math.max(0, Math.min(1, ratio));
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

function buildDecisionExplanation({
  decision,
  recommendationGroup,
  reasons,
  hasAvailabilitySignal = false,
  hasBroadAvailability = false,
}) {
  const primary = reasons[0] ? lowerFirst(reasons[0]) : '';
  const secondary = reasons[1] ? lowerFirst(reasons[1]) : '';
  const primaryIsSkill = primary.includes('skill alignment');

  if (decision === 'recommend' && recommendationGroup === 'recommended') {
    if (primaryIsSkill && !secondary) {
      return 'Recommended based on your skill match.';
    }
    if (primary && secondary) {
      return `This activity is recommended because it strongly matches your ${primary} and ${secondary}.`;
    }
    return hasAvailabilitySignal
      ? hasBroadAvailability
        ? 'This activity is recommended because your skills align well and your broad availability can still support it.'
        : 'This activity is recommended because it strongly matches your skills, interests, and availability.'
      : 'This activity is recommended because it strongly matches your skills and interest signals.';
  }

  if (decision === 'recommend') {
    if (primaryIsSkill && !secondary) {
      return 'Recommended based on your skill match.';
    }
    if (primary && secondary) {
      return `This activity is a good match because your ${primary} and ${secondary} align with the activity requirements.`;
    }
    return 'This activity is a good match because several parts of your profile align with the activity requirements.';
  }

  if (decision === 'consider') {
    if (primaryIsSkill && !secondary) {
      return 'Recommended based on your skill match. Add interests and availability to improve future ranking.';
    }
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

function hasAvailabilitySignalFromScoreBreakdown(scoreBreakdown) {
  return Number(scoreBreakdown?.availability_score ?? 0) > 0;
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
  featureSnapshot,
  predictionSnapshot,
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
        hasAvailabilitySignal: false,
        hasBroadAvailability: false,
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
  const hasAvailabilitySignal = hasAvailabilitySignalFromScoreBreakdown(scoreBreakdown);
  const hasBroadAvailability = Boolean(featureSnapshot?.availability_is_broad);
  const hasInterestSignal = Number(scoreBreakdown?.interest_score ?? 0) > 0;
  const hasExperienceSignal = Number(scoreBreakdown?.experience_score ?? 0) >= Math.max(1, Math.floor(EXPERIENCE_SCORE_MAX * 0.3));
  const hasHistorySignal = Number(scoreBreakdown?.history_score ?? 0) > 0;
  const hasSkillSignal = skillRatio >= 0.2;
  const hasStrongSkillSignal = skillRatio >= 0.4;
  const hasTrustedAvailabilitySignal = hasAvailabilitySignal && !hasBroadAvailability && availabilityRatio >= 0.35;
  const matchedSkillCount = Array.isArray(featureSnapshot?.matched_skills) ? featureSnapshot.matched_skills.length : 0;
  const matchedInterestCount = Array.isArray(featureSnapshot?.matched_interests) ? featureSnapshot.matched_interests.length : 0;
  const onlyHistorySignal =
    Number(scoreBreakdown?.history_score ?? 0) > 0 &&
    Number(scoreBreakdown?.skill_score ?? 0) === 0 &&
    Number(scoreBreakdown?.interest_score ?? 0) === 0 &&
    Number(scoreBreakdown?.availability_score ?? 0) === 0 &&
    Number(scoreBreakdown?.experience_score ?? 0) === 0;
  const mlScoreSnapshot = Number(predictionSnapshot?.ml_score ?? Number.NaN);
  const weakCoreEvidence =
    matchedSkillCount === 0 &&
    matchedInterestCount === 0 &&
    !hasTrustedAvailabilitySignal &&
    Number(scoreBreakdown?.experience_score ?? 0) <= 0;
  const mlHighScoreWithoutCoreEvidence =
    Number.isFinite(mlScoreSnapshot) &&
    mlScoreSnapshot >= 75 &&
    (onlyHistorySignal || weakCoreEvidence);
  const trustedSignalCount =
    Number(hasSkillSignal) +
    Number(hasInterestSignal) +
    Number(hasTrustedAvailabilitySignal) +
    Number(hasExperienceSignal) +
    Number(hasHistorySignal);

  let decision = 'not_recommended';
  let recommendationGroup = 'not_recommended';
  let ctaLabel = 'Browse all opportunities';
  let priorityLabel = 'Low match';
  let decisionReason = 'low_profile_match';
  let explanation = buildDecisionExplanation({
    decision,
    recommendationGroup,
    reasons,
    hasAvailabilitySignal,
    hasBroadAvailability,
  });

  if (matchScore >= 78 && hasStrongSkillSignal && trustedSignalCount >= 3) {
    decision = 'recommend';
    recommendationGroup = 'recommended';
    ctaLabel = 'Join now';
    priorityLabel = 'Best match';
    decisionReason = 'high_skill_and_availability_match';
  } else if (
    matchScore >= 60 &&
    hasSkillSignal &&
    trustedSignalCount >= 2 &&
    (hasInterestSignal || hasExperienceSignal || hasHistorySignal || hasTrustedAvailabilitySignal)
  ) {
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
    (hasInterestSignal || hasTrustedAvailabilitySignal)
  ) {
    decision = 'consider';
    recommendationGroup = 'consider_later';
    ctaLabel = 'Explore option';
    priorityLabel = 'Potential fit';
    decisionReason = 'limited_but_promising_signal';
  } else if (skillRatio >= 0.2 && !hasAvailabilitySignal && !hasInterestSignal) {
    decision = 'consider';
    recommendationGroup = 'consider_later';
    ctaLabel = 'Explore option';
    priorityLabel = 'Starter match';
    decisionReason = 'cold_start_skill_match';
    explanation =
      'Recommended based on your skills. Add availability and interests to improve future matches.';
  }

  // Keep user-facing tier tied to score quality, independent from action policy.
  const effectiveTier = getMatchTier(matchScore);
  if (decisionReason !== 'cold_start_skill_match') {
    explanation = buildDecisionExplanation({
      decision,
      recommendationGroup,
      reasons,
      hasAvailabilitySignal,
      hasBroadAvailability,
    });
  }

  if (mlHighScoreWithoutCoreEvidence && decision === 'recommend') {
    decision = 'consider';
    recommendationGroup = 'consider_later';
    ctaLabel = 'Explore option';
    priorityLabel = 'Potential fit';
    decisionReason = onlyHistorySignal
      ? 'ml_overconfidence_guard_only_history_signal'
      : 'ml_overconfidence_guard_weak_core_evidence';
    explanation =
      'This activity is kept as a potential fit because the ML score is high but core skill/interest evidence is still limited.';
  }

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
    featureSnapshot: structured.feature_snapshot,
    predictionSnapshot: structured.prediction_snapshot,
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

function scoreActivityForVolunteerProfile({
  activity,
  profile,
  hasOrganizerHistory = false,
  organizerHistoryCount = 0,
  historyCutoffAt = null,
}) {
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
  const normalizedAvailableChoices = getAvailableChoices(profile?.available_choices);
  const availabilityCoverage =
    TOTAL_AVAILABILITY_SLOTS > 0 ? normalizedAvailableChoices.length / TOTAL_AVAILABILITY_SLOTS : 0;
  const durationHoursRaw = computeDurationHours(activity?.start_time, activity?.end_time);
  const durationHours = Number.isFinite(Number(durationHoursRaw)) ? Number(durationHoursRaw) : 0;
  const durationFitRatio = durationHours <= 0 ? 0 : Math.max(0, Math.min(1, 1 - Math.abs(durationHours - 3) / 5));
  const availabilityIsBroad = availabilityCoverage >= 0.85;
  let availabilityWeight = 1;
  if (availabilityCoverage >= 0.95) {
    availabilityWeight = 0.35;
  } else if (availabilityCoverage >= 0.8) {
    availabilityWeight = 0.55;
  } else if (availabilityCoverage >= 0.65) {
    availabilityWeight = 0.75;
  }
  const adjustedAvailabilityScore =
    availabilityMatch.score > 0 ? Math.max(1, Math.round(availabilityMatch.score * availabilityWeight)) : 0;

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
  const profileCompletenessRatio =
    (Number(volunteerSkills.size > 0) +
      Number(interests.size > 0) +
      Number(normalizedAvailableChoices.length > 0) +
      Number(totalHours > 0)) /
    4;
  const requiredSkillDensityRatio = Math.max(0, Math.min(1, requiredSkills.size / 4));
  const experienceScore = Math.max(0, Math.min(EXPERIENCE_SCORE_MAX, Math.round(totalHours / 10)));
  const effectiveOrganizerHistoryCount = Math.max(0, Math.trunc(Number(organizerHistoryCount ?? 0)));
  const hasOrganizerHistorySignal = hasOrganizerHistory || effectiveOrganizerHistoryCount > 0;
  const historyRatioCapped = hasOrganizerHistorySignal ? computeHistorySignalRatio(effectiveOrganizerHistoryCount) : 0;
  const organizerHistoryScore = Math.round(HISTORY_SCORE_MAX * historyRatioCapped);

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

  if (adjustedAvailabilityScore > 0) {
    if (availabilityIsBroad) {
      reasons.push('Availability broadly overlaps this activity schedule');
      reasonCodes.push('availability_broad_overlap');
    } else {
      reasons.push(...availabilityMatch.reasons);
      reasonCodes.push('availability_overlap');
    }
  }

  if (experienceScore > 0) {
    reasons.push(`Volunteer has ${totalHours} recorded hours`);
    reasonCodes.push('experience_signal');
  }

    if (hasOrganizerHistorySignal) {
    reasons.push(
      effectiveOrganizerHistoryCount > 0
        ? `Prior participation with this organizer (${effectiveOrganizerHistoryCount})`
        : 'Prior participation with this organizer'
    );
    reasonCodes.push('organizer_history_signal');
  }

  const matchScore = Math.max(
    0,
    Math.min(100, skillScore + interestScore + adjustedAvailabilityScore + experienceScore + organizerHistoryScore)
  );
  const scoreBreakdown = {
    skill_score: skillScore,
    interest_score: interestScore,
    availability_score: adjustedAvailabilityScore,
    experience_score: experienceScore,
    history_score: organizerHistoryScore,
    profile_completeness_ratio: Number(profileCompletenessRatio.toFixed(3)),
    availability_coverage_ratio: Number(availabilityCoverage.toFixed(3)),
    required_skill_density_ratio: Number(requiredSkillDensityRatio.toFixed(3)),
    duration_fit_ratio: Number(durationFitRatio.toFixed(3)),
    duration_hours: Number(durationHours.toFixed(2)),
    availability_raw_score: availabilityMatch.score,
    availability_weight: Number(availabilityWeight.toFixed(2)),
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
      adjustedAvailabilityScore,
      AVAILABILITY_SCORE_MAX,
      adjustedAvailabilityScore > 0
        ? availabilityIsBroad
          ? 'Availability overlaps, but schedule is broad so contribution is reduced'
          : availabilityMatch.reasons[0] ?? 'Availability overlap detected'
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
      hasOrganizerHistorySignal
        ? `Volunteer has ${effectiveOrganizerHistoryCount || 1} prior successful participation(s) with this organizer`
        : 'No prior organizer history signal'
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
      availability_raw_score: scoreBreakdown.availability_raw_score,
      availability_weight: scoreBreakdown.availability_weight,
      availability_is_broad: availabilityIsBroad,
      profile_completeness_ratio: Number(profileCompletenessRatio.toFixed(3)),
      required_skill_density_ratio: Number(requiredSkillDensityRatio.toFixed(3)),
      duration_fit_ratio: Number(durationFitRatio.toFixed(3)),
      duration_hours: Number(durationHours.toFixed(2)),
      experience_score: scoreBreakdown.experience_score,
      history_score: scoreBreakdown.history_score,
      history_ratio_capped: Number(historyRatioCapped.toFixed(3)),
      history_cutoff_at: historyCutoffAt ?? null,
      volunteer_skills: Array.from(volunteerSkills),
      required_skills: Array.from(requiredSkills),
      matched_skills: matchedSkills,
      volunteer_interests: Array.from(interests),
      matched_interests: matchedInterests,
      available_choices: normalizedAvailableChoices,
      availability_match: adjustedAvailabilityScore > 0,
      availability_profile_coverage: Number(availabilityCoverage.toFixed(3)),
      organizer_history_count: effectiveOrganizerHistoryCount,
    },
    prediction_snapshot: {
      strategy: 'heuristic_scoring',
      final_score: matchScore,
      heuristic_score: matchScore,
      ml_score: null,
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

async function getVolunteerHistoryContext(volunteerId, options = {}) {
  const historyCutoffMs = parseTimestampMs(options?.historyCutoffAt ?? null);
  const excludedActivityId = String(options?.excludeActivityId ?? '').trim();
  const { data, error } = await supabaseAdmin
    .from('activity_participations')
    .select('activity_id, status, created_at')
    .eq('volunteer_id', volunteerId)
    .limit(500);

  if (error) {
    throw new Error(error.message);
  }

  const registeredActivityIds = new Set();
  const activeRegisteredActivityIds = new Set();
  const checkedInActivityIds = new Set();
  const approvedActivityIds = new Set();
  const successStatusByActivityId = new Map();
  for (const row of data ?? []) {
    const normalizedStatus = String(row.status ?? '').trim().toLowerCase();
    const rowCreatedAtMs = parseTimestampMs(row.created_at);
    const outsideHistoryWindow =
      Number.isFinite(historyCutoffMs) &&
      Number.isFinite(rowCreatedAtMs) &&
      rowCreatedAtMs >= historyCutoffMs;
    if (row.activity_id) {
      registeredActivityIds.add(row.activity_id);
    }
    if (row.activity_id && ACTIVE_PARTICIPATION_STATUSES.has(normalizedStatus)) {
      activeRegisteredActivityIds.add(row.activity_id);
    }
    if (outsideHistoryWindow) {
      continue;
    }
    if (excludedActivityId && String(row.activity_id).trim() === excludedActivityId) {
      continue;
    }
    if (row.activity_id && normalizedStatus === 'checked_in') {
      checkedInActivityIds.add(row.activity_id);
      const current = successStatusByActivityId.get(row.activity_id) ?? new Set();
      current.add('checked_in');
      successStatusByActivityId.set(row.activity_id, current);
    }
    if (row.activity_id && normalizedStatus === 'approved') {
      approvedActivityIds.add(row.activity_id);
      const current = successStatusByActivityId.get(row.activity_id) ?? new Set();
      current.add('approved');
      successStatusByActivityId.set(row.activity_id, current);
    }
  }

  const successfulActivityIds = new Set([...checkedInActivityIds, ...approvedActivityIds]);
  if (successfulActivityIds.size === 0) {
    return {
      registeredActivityIds,
      activeRegisteredActivityIds,
      organizerHistoryIds: new Set(),
      organizerHistoryCounts: new Map(),
    };
  }

  const now = Date.now();
  const effectiveCutoffMs = Number.isFinite(historyCutoffMs) ? historyCutoffMs : now;
  const { data: activities, error: activitiesError } = await supabaseAdmin
    .from('activities')
    .select('id, organizer_id, status, end_time, deleted_at')
    .in('id', Array.from(successfulActivityIds));

  if (activitiesError) {
    throw new Error(activitiesError.message);
  }

  const organizerHistoryCounts = new Map();
  for (const row of activities ?? []) {
    const activityId = String(row?.id ?? '').trim();
    const organizerId = String(row?.organizer_id ?? '').trim();
    if (!activityId || !organizerId || row?.deleted_at) {
      continue;
    }

    const statusSet = successStatusByActivityId.get(activityId) ?? new Set();
    const hasCheckedIn = statusSet.has('checked_in');
    const hasApproved = statusSet.has('approved');
    const activityStatus = String(row?.status ?? '').trim().toLowerCase();
    const endTimeMs = new Date(row?.end_time ?? 0).getTime();
    const endedBeforeCutoff = Number.isFinite(endTimeMs) && endTimeMs > 0 && endTimeMs < effectiveCutoffMs;
    const hasAnySuccessStatus = hasCheckedIn || hasApproved;
    const qualifiesForHistory = hasAnySuccessStatus && (activityStatus === 'completed' || endedBeforeCutoff);
    if (!qualifiesForHistory) {
      continue;
    }

    organizerHistoryCounts.set(organizerId, (organizerHistoryCounts.get(organizerId) ?? 0) + 1);
  }

  return {
    registeredActivityIds,
    activeRegisteredActivityIds,
    organizerHistoryIds: new Set(Array.from(organizerHistoryCounts.keys())),
    organizerHistoryCounts,
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

async function calculateActivityMatchForVolunteer({
  activity,
  volunteerId,
  historyCutoffAt = null,
  excludeActivityId = null,
}) {
  const effectiveHistoryCutoffAt =
    resolveHistoryCutoffIso({
      participationCreatedAt: historyCutoffAt,
      activityStartTime: null,
    }) ?? new Date().toISOString();
  const [{ profile }, history] = await Promise.all([
    getVolunteerProfileBundle(volunteerId),
    getVolunteerHistoryContext(volunteerId, {
      historyCutoffAt: effectiveHistoryCutoffAt,
      excludeActivityId,
    }),
  ]);

  const organizerId = String(activity?.organizer_id ?? '').trim();
  const organizerHistoryCount =
    organizerId && history?.organizerHistoryCounts instanceof Map ? Number(history.organizerHistoryCounts.get(organizerId) ?? 0) : 0;
  return scoreActivityForVolunteerProfile({
    activity,
    profile,
    hasOrganizerHistory: organizerHistoryCount > 0,
    organizerHistoryCount,
    historyCutoffAt: effectiveHistoryCutoffAt,
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

  if (RECOMMENDATION_DEBUG) {
    console.info(
      `[recommendation.debug] volunteer=${userId} profile_skills=${JSON.stringify(Array.isArray(profile?.skills) ? profile.skills : [])} profile_interests=${JSON.stringify(Array.isArray(profile?.interests) ? profile.interests : [])} profile_available_choices=${JSON.stringify(Array.isArray(profile?.available_choices) ? profile.available_choices : [])} total_hours=${Number(profile?.total_hours ?? 0)}`
    );
  }

  const runtimeHistoryCutoffAt = new Date().toISOString();
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
      organizerHistoryCount: Number(history?.organizerHistoryCounts?.get?.(activity.organizer_id) ?? 0),
      historyCutoffAt: runtimeHistoryCutoffAt,
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

  if (RECOMMENDATION_DEBUG) {
    const debugRows = candidateRows.slice(0, 30).map((row) => ({
      volunteer_id: userId,
      activity_id: row.activityId,
      title: row.title,
      model_kind: String(row.model_kind ?? 'heuristic'),
      volunteer_skills: Array.isArray(row.feature_snapshot?.volunteer_skills) ? row.feature_snapshot.volunteer_skills : [],
      activity_required_skills: Array.isArray(row.feature_snapshot?.required_skills) ? row.feature_snapshot.required_skills : [],
      matched_skills: Array.isArray(row.feature_snapshot?.matched_skills) ? row.feature_snapshot.matched_skills : [],
      volunteer_interests: Array.isArray(row.feature_snapshot?.volunteer_interests) ? row.feature_snapshot.volunteer_interests : [],
      matched_interests: Array.isArray(row.feature_snapshot?.matched_interests) ? row.feature_snapshot.matched_interests : [],
      available_choices: Array.isArray(row.feature_snapshot?.available_choices) ? row.feature_snapshot.available_choices : [],
      availability_match: Boolean(row.feature_snapshot?.availability_match),
      availability_profile_coverage: Number(row.feature_snapshot?.availability_profile_coverage ?? 0),
      availability_is_broad: Boolean(row.feature_snapshot?.availability_is_broad),
      organizer_history_count: Number(row.feature_snapshot?.organizer_history_count ?? 0),
      skill_ratio: Number((Number(row.score_breakdown?.skill_score ?? 0) / SKILL_SCORE_MAX).toFixed(3)),
      interest_ratio: Number((Number(row.score_breakdown?.interest_score ?? 0) / INTEREST_SCORE_MAX).toFixed(3)),
      availability_ratio: Number((Number(row.score_breakdown?.availability_score ?? 0) / AVAILABILITY_SCORE_MAX).toFixed(3)),
      experience_ratio: Number((Number(row.score_breakdown?.experience_score ?? 0) / EXPERIENCE_SCORE_MAX).toFixed(3)),
      history_ratio: Number((Number(row.score_breakdown?.history_score ?? 0) / HISTORY_SCORE_MAX).toFixed(3)),
      heuristic_score: Number(row.prediction_snapshot?.heuristic_score ?? row.score_breakdown?.final_score ?? 0),
      ml_score: Number(row.prediction_snapshot?.ml_score ?? Number.NaN),
      final_score: Number(row.prediction_snapshot?.final_score ?? row.matchScore ?? 0),
      model_weights:
        row.model_kind === 'ml_logistic_regression_v1' && row.prediction_snapshot?.weights
          ? row.prediction_snapshot.weights
          : null,
      contribution_breakdown: Array.isArray(row.feature_contributions)
        ? row.feature_contributions.map((item) => ({
            feature: item?.feature ?? null,
            score: Number(item?.score ?? 0),
            raw_contribution: Number(item?.raw_contribution ?? Number.NaN),
            signal_ratio: Number(item?.signal_ratio ?? Number.NaN),
          }))
        : [],
      reason_codes: Array.isArray(row.reason_codes) ? row.reason_codes : [],
      display_reasons: Array.isArray(row.display_reasons) ? row.display_reasons : [],
      decision: row?.ai_decision?.decision ?? null,
      decision_reason: row?.ai_decision?.decision_reason ?? null,
    }));
    console.info(`[recommendation.debug] candidate_summary=${JSON.stringify(debugRows)}`);
  }

  const decisionOrder = {
    recommend: 0,
    consider: 1,
    not_recommended: 2,
    ineligible: 3,
  };

  candidateRows.sort((left, right) => {
    // Ranking must use the same score shown to users as match percentage.
    // Decision is only a tie-breaker.
    const scoreGap = Number(right.matchScore ?? 0) - Number(left.matchScore ?? 0);
    if (scoreGap !== 0) {
      return scoreGap;
    }

    const leftDecision = String(left?.ai_decision?.decision ?? 'not_recommended');
    const rightDecision = String(right?.ai_decision?.decision ?? 'not_recommended');
    const leftOrder = decisionOrder[leftDecision] ?? 99;
    const rightOrder = decisionOrder[rightDecision] ?? 99;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    const startTimeGap = String(left.startTime ?? '').localeCompare(String(right.startTime ?? ''));
    if (startTimeGap !== 0) {
      return startTimeGap;
    }

    return String(left.activityId ?? '').localeCompare(String(right.activityId ?? ''));
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

  const fallbackPrimaryIndex = 0;
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
  const scoringStrategy = String(
    includedRows[0]?.prediction_snapshot?.scoring_strategy ??
      candidateRows[0]?.prediction_snapshot?.scoring_strategy ??
      (fallbackUsed ? 'heuristic_fallback' : 'hybrid_heuristic_ml_blend')
  ).trim();

  return {
    userId,
    role: 'volunteer',
    ai_recommendation_session: {
      controller_version: INTERNAL_RECOMMENDATION_CONTROLLER_VERSION,
      model_kind: modelKind,
      model_version: modelVersion,
      provider,
      fallback_used: fallbackUsed,
      scoring_strategy: scoringStrategy,
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

  const runtimeHistoryCutoffAt = new Date().toISOString();
  const volunteers = candidates
    .filter((candidate) => !registeredVolunteerIds.has(candidate.user.id))
    .map((candidate) => {
      const score = scoreActivityForVolunteerProfile({
        activity,
        profile: candidate.profile,
        hasOrganizerHistory: false,
        historyCutoffAt: runtimeHistoryCutoffAt,
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

  const runtimeHistoryCutoffAt = new Date().toISOString();
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
        historyCutoffAt: runtimeHistoryCutoffAt,
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
