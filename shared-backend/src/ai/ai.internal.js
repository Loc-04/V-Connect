import {
  calculateActivityMatchForVolunteer,
  getRecommendationsForActivity,
  getRecommendationsForUser,
} from '../recommendations/recommendations.service.js';
import { classifyFeedbackSpam } from '../feedback/feedback.spam.js';
import { classifyFeedbackSemantics } from '../feedback/feedback.classification.js';
import { buildOrganizerReportSummary } from '../reports/reports.service.js';

function createBadRequestError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizeLimit(rawValue, fallback = 10, max = 50) {
  const value = Number(rawValue ?? fallback);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.trunc(value), 1), max);
}

function normalizeMatchResult(result) {
  const matchScore = Number(result?.matchScore ?? 0);
  const safeMatchScore = Number.isFinite(matchScore) ? Math.max(0, Math.min(100, Math.round(matchScore))) : 0;
  const matchRatioRaw = Number(result?.matchRatio);
  const matchRatio =
    Number.isFinite(matchRatioRaw) && matchRatioRaw >= 0
      ? Math.max(0, Math.min(1, Number(matchRatioRaw.toFixed(2))))
      : Number((safeMatchScore / 100).toFixed(2));

  const reasons = Array.isArray(result?.reasons)
    ? result.reasons
        .map((reason) => String(reason ?? '').trim())
        .filter((reason) => reason.length > 0)
    : [];

  const explanation = String(result?.explanation ?? '').trim();
  const reasonCodes = Array.isArray(result?.reason_codes)
    ? result.reason_codes.map((code) => String(code ?? '').trim()).filter((code) => code.length > 0)
    : [];
  const scoreBreakdown =
    result?.score_breakdown && typeof result.score_breakdown === 'object' && !Array.isArray(result.score_breakdown)
      ? {
          skill_score: Number(result.score_breakdown.skill_score ?? 0),
          interest_score: Number(result.score_breakdown.interest_score ?? 0),
          availability_score: Number(result.score_breakdown.availability_score ?? 0),
          experience_score: Number(result.score_breakdown.experience_score ?? 0),
          history_score: Number(result.score_breakdown.history_score ?? 0),
          final_score: Number(result.score_breakdown.final_score ?? safeMatchScore),
        }
      : null;
  const featureContributions = Array.isArray(result?.feature_contributions)
    ? result.feature_contributions
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({
          feature: String(item.feature ?? '').trim(),
          score: Number(item.score ?? 0),
          max_score: Number(item.max_score ?? 0),
          detail: String(item.detail ?? '').trim(),
        }))
    : [];
  const modelVersion = String(result?.model_version ?? '').trim() || 'heuristic-v2-lite-2026-04';

  return {
    matchScore: safeMatchScore,
    matchRatio,
    reasons,
    reason_codes: reasonCodes,
    score_breakdown: scoreBreakdown,
    feature_contributions: featureContributions,
    model_version: modelVersion,
    explanation:
      explanation || 'Calculated from volunteer skills, interests, availability, and prior activity history.',
  };
}

async function recommend(input = {}) {
  const scope = String(input?.scope ?? 'user').trim().toLowerCase();

  if (scope === 'activity') {
    const activityId = String(input?.activityId ?? '').trim();
    if (!activityId) {
      throw createBadRequestError('activityId is required for activity recommendations.');
    }
    return getRecommendationsForActivity(activityId, normalizeLimit(input?.limit));
  }

  if (scope === 'match') {
    const volunteerId = String(input?.volunteerId ?? '').trim();
    if (!volunteerId || !input?.activity) {
      throw createBadRequestError('volunteerId and activity are required for recommendation match scoring.');
    }

    const result = await calculateActivityMatchForVolunteer({
      activity: input.activity,
      volunteerId,
    });
    return normalizeMatchResult(result);
  }

  const userId = String(input?.userId ?? '').trim();
  if (!userId) {
    throw createBadRequestError('userId is required for user recommendations.');
  }

  return getRecommendationsForUser(userId, normalizeLimit(input?.limit));
}

async function classifyFeedback(input = {}) {
  const comment = String(input?.comment ?? '');
  const classification = classifyFeedbackSpam(comment);
  const semantics = classifyFeedbackSemantics({
    comment,
    rating: input?.rating ?? null,
  });

  const reasons = Array.isArray(classification?.reasons)
    ? classification.reasons
        .map((reason) => String(reason ?? '').trim())
        .filter((reason) => reason.length > 0)
    : [];

  const label = String(classification?.label ?? '').trim().toLowerCase() === 'spam' ? 'spam' : 'not_spam';
  return {
    label,
    isSpam: label === 'spam',
    reasons,
    sentimentLabel: semantics.sentimentLabel,
    incidentLabel: semantics.incidentLabel,
    semanticLabel: semantics.semanticLabel,
    moderationLabels: Array.isArray(semantics.moderationLabels) ? semantics.moderationLabels : [],
    semanticLabels: Array.isArray(semantics.semanticLabels) ? semantics.semanticLabels : [],
    issueTags: Array.isArray(semantics.issueTags) ? semantics.issueTags : [],
    confidence:
      semantics?.confidence && typeof semantics.confidence === 'object'
        ? {
            sentiment: Number(semantics.confidence.sentiment ?? 0),
            incident: Number(semantics.confidence.incident ?? 0),
            semantic: Number(semantics.confidence.semantic ?? 0),
          }
        : null,
    semanticReasons: semantics.semanticReasons,
  };
}

async function summarizeReport(input = {}) {
  const organizerId = String(input?.organizerId ?? '').trim();
  if (!organizerId) {
    throw createBadRequestError('organizerId is required for report summarization.');
  }

  const activityId = String(input?.activityId ?? '').trim() || null;
  return buildOrganizerReportSummary({
    organizerId,
    activityId,
  });
}

export { recommend, classifyFeedback, summarizeReport };
