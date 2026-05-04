import { Router } from 'express';
import { feedbackColumns, feedbackEligibleParticipationStatuses } from '../config/constants.js';
import { isPlainObject, isUuid } from '../common/utils/validators.js';
import { supabaseAdmin } from '../database/supabase.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { normalizeFeedbackPayload } from './feedback.validation.js';
import { classifyFeedback } from '../ai/ai.router.js';
import { classifyFeedbackSpam } from './feedback.spam.js';
import { classifyFeedbackSemantics } from './feedback.classification.js';
import { normalizeFeedbackLabel, pickFinalFeedbackLabel } from './feedback.final-label.js';

const router = Router();

const moderationStatusValues = new Set(['pending', 'in_review', 'resolved', 'dismissed']);
const manualAiLabelValues = new Set(['spam', 'not_spam', 'auto']);
const moderationColumnLayouts = [
  {
    statusColumn: 'review_status',
    flagColumn: 'is_flagged',
    aiLabelColumn: 'ai_label',
    reasonColumn: 'flag_reason',
    reviewedAtColumn: 'reviewed_at',
    reviewedByColumn: 'reviewed_by',
    updatedAtColumn: 'updated_at',
  },
  {
    statusColumn: 'moderation_status',
    flagColumn: 'is_flagged',
    aiLabelColumn: 'ai_label',
    reasonColumn: 'flag_reason',
    reviewedAtColumn: 'reviewed_at',
    reviewedByColumn: 'reviewed_by',
    updatedAtColumn: 'updated_at',
  },
  {
    statusColumn: 'status',
    flagColumn: 'flagged',
    aiLabelColumn: 'ai_label',
    reasonColumn: 'flag_reason',
    reviewedAtColumn: 'reviewed_at',
    reviewedByColumn: 'reviewed_by',
    updatedAtColumn: 'updated_at',
  },
  {
    statusColumn: null,
    flagColumn: null,
    aiLabelColumn: null,
    reasonColumn: null,
    reviewedAtColumn: null,
    reviewedByColumn: null,
    updatedAtColumn: null,
  },
];

const baseFeedbackColumns = feedbackColumns
  .split(',')
  .map((column) => column.trim())
  .filter(Boolean);

function createFeedbackSelectColumns(layout, { includeAiLabel = true } = {}) {
  const extraColumns = [
    layout.statusColumn,
    layout.flagColumn,
    includeAiLabel ? layout.aiLabelColumn : null,
    layout.reasonColumn,
    layout.reviewedAtColumn,
    layout.reviewedByColumn,
    layout.updatedAtColumn,
  ].filter(Boolean);

  return Array.from(new Set([...baseFeedbackColumns, ...extraColumns])).join(', ');
}

function isMissingColumnError(error) {
  const message = String(error?.message ?? '').toLowerCase();
  return error?.code === '42703' || (message.includes('column') && message.includes('does not exist'));
}

function isModerationSchemaUnsupported(error) {
  return String(error?.message ?? '').toLowerCase().includes('moderation columns are not available');
}

function parseManualAiLabelValue(rawValue) {
  if (typeof rawValue !== 'string') {
    throw new Error(`label must be one of: ${Array.from(manualAiLabelValues).join(', ')}.`);
  }

  const normalized = rawValue.trim().toLowerCase();
  if (normalized === 'spam') {
    return 'spam';
  }
  if (normalized === 'not_spam' || normalized === 'not spam' || normalized === 'ham') {
    return 'not_spam';
  }
  if (normalized === 'auto' || normalized === 'reset' || normalized === 'clear') {
    return null;
  }

  throw new Error(`label must be one of: ${Array.from(manualAiLabelValues).join(', ')}.`);
}

function parseBooleanQuery(rawValue, fieldName) {
  if (rawValue == null || rawValue === '') {
    return null;
  }

  if (typeof rawValue !== 'string') {
    throw new Error(`${fieldName} must be true or false.`);
  }

  const normalized = rawValue.trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }

  throw new Error(`${fieldName} must be true or false.`);
}

function inferIncidentFlag(feedback) {
  const rating = Number(feedback.rating ?? 0);
  if (rating <= 2) {
    return true;
  }

  const text = String(feedback.comment ?? '').toLowerCase();
  return (
    text.includes('incident') ||
    text.includes('unsafe') ||
    text.includes('abuse') ||
    text.includes('harass') ||
    text.includes('issue') ||
    text.includes('problem') ||
    text.includes('complaint')
  );
}

function normalizeModerationStatus(statusValue) {
  if (typeof statusValue !== 'string') {
    return null;
  }

  const normalized = statusValue.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (moderationStatusValues.has(normalized)) {
    return normalized;
  }

  return null;
}

function normalizeSpamLabel(aiLabelRaw) {
  if (typeof aiLabelRaw !== 'string') {
    return null;
  }

  const normalized = aiLabelRaw.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized === 'not_spam' || normalized === 'not spam' || normalized === 'ham') {
    return 'not_spam';
  }

  if (
    normalized === 'spam' ||
    normalized.startsWith('spam:') ||
    normalized === 'is_spam' ||
    (normalized.includes('spam') && !normalized.includes('not'))
  ) {
    return 'spam';
  }

  return null;
}

function normalizeFeedbackBucket(rawValue) {
  if (typeof rawValue !== 'string') {
    return null;
  }
  const normalized = rawValue.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === 'spam') {
    return 'spam';
  }
  if (normalized === 'low_signal' || normalized === 'low signal' || normalized === 'uninformative') {
    return 'low_signal';
  }
  if (normalized === 'valid') {
    return 'valid';
  }
  return null;
}

function normalizeAiClassification(classification) {
  if (!classification || typeof classification !== 'object') {
    return {
      label: null,
      feedbackBucket: null,
      reasons: [],
      sentimentLabel: null,
      incidentLabel: null,
      semanticLabel: null,
      semanticReasons: [],
      moderationLabels: [],
      semanticLabels: [],
      issueTags: [],
      confidence: null,
      textQuality: null,
      finalLabel: null,
    };
  }

  const label = normalizeSpamLabel(classification.label);
  const feedbackBucket = normalizeFeedbackBucket(classification.feedbackBucket);
  const reasons = Array.isArray(classification.reasons)
    ? classification.reasons
        .map((reason) => String(reason ?? '').trim())
        .filter((reason) => reason.length > 0)
    : [];
  const semanticReasons = Array.isArray(classification.semanticReasons)
    ? classification.semanticReasons
        .map((reason) => String(reason ?? '').trim())
        .filter((reason) => reason.length > 0)
    : [];
  const moderationLabels = Array.isArray(classification.moderationLabels)
    ? classification.moderationLabels
        .map((value) => String(value ?? '').trim().toLowerCase())
        .filter((value) => value.length > 0)
    : [];
  const semanticLabels = Array.isArray(classification.semanticLabels)
    ? classification.semanticLabels
        .map((value) => String(value ?? '').trim().toLowerCase())
        .filter((value) => value.length > 0)
    : [];
  const issueTags = Array.isArray(classification.issueTags)
    ? classification.issueTags
        .map((value) => String(value ?? '').trim().toLowerCase())
        .filter((value) => value.length > 0)
    : [];
  const confidence =
    classification?.confidence && typeof classification.confidence === 'object'
      ? {
          sentiment: Number(classification.confidence.sentiment ?? 0),
          incident: Number(classification.confidence.incident ?? 0),
          semantic: Number(classification.confidence.semantic ?? 0),
        }
      : null;
  const textQuality =
    classification?.textQuality && typeof classification.textQuality === 'object'
      ? {
          isLowSignal: Boolean(classification.textQuality.isLowSignal),
          label: String(classification.textQuality.label ?? '').trim() || 'informative',
          reasons: Array.isArray(classification.textQuality.reasons)
            ? classification.textQuality.reasons
                .map((reason) => String(reason ?? '').trim())
                .filter((reason) => reason.length > 0)
                .slice(0, 6)
            : [],
          metrics:
            classification.textQuality.metrics && typeof classification.textQuality.metrics === 'object'
              ? {
                  tokenCount: Number(classification.textQuality.metrics.tokenCount ?? 0),
                  meaningfulWordCount: Number(classification.textQuality.metrics.meaningfulWordCount ?? 0),
                  alphabeticRatio: Number(classification.textQuality.metrics.alphabeticRatio ?? 0),
                  numericRatio: Number(classification.textQuality.metrics.numericRatio ?? 0),
                  longestRepeatedCharRun: Number(classification.textQuality.metrics.longestRepeatedCharRun ?? 0),
                  maxTokenFrequency: Number(classification.textQuality.metrics.maxTokenFrequency ?? 0),
                }
              : null,
        }
      : null;

  const sentimentRaw = String(classification.sentimentLabel ?? '').trim().toLowerCase();
  const incidentRaw = String(classification.incidentLabel ?? '').trim().toLowerCase();
  const semanticRaw = String(classification.semanticLabel ?? '').trim().toLowerCase();

  const sentimentLabel = ['positive', 'negative', 'neutral'].includes(sentimentRaw) ? sentimentRaw : null;
  const incidentLabel = incidentRaw === 'incident' ? 'incident' : incidentRaw === 'none' ? 'none' : null;
  const semanticLabel =
    semanticRaw === 'incident' ||
    semanticRaw === 'positive' ||
    semanticRaw === 'negative' ||
    semanticRaw === 'neutral' ||
    semanticRaw === 'low_signal'
      ? semanticRaw
      : null;
  const rawFinalLabel = classification.finalLabel ?? classification.final_label ?? null;
  const finalLabel =
    rawFinalLabel == null || String(rawFinalLabel).trim().length === 0
      ? null
      : normalizeFeedbackLabel(rawFinalLabel);

  return {
    label,
    feedbackBucket,
    reasons: Array.from(new Set(reasons)).slice(0, 4),
    sentimentLabel,
    incidentLabel,
    semanticLabel,
    semanticReasons: Array.from(new Set(semanticReasons)).slice(0, 4),
    moderationLabels: Array.from(new Set(moderationLabels)).slice(0, 6),
    semanticLabels: Array.from(new Set(semanticLabels)).slice(0, 6),
    issueTags: Array.from(new Set(issueTags)).slice(0, 8),
    confidence,
    textQuality,
    finalLabel,
  };
}

function resolveFeedbackBucket({ aiLabel, semanticLabel, textQuality, issueTags, persistedBucket }) {
  const normalizedPersistedBucket = normalizeFeedbackBucket(persistedBucket);
  if (normalizedPersistedBucket) {
    return normalizedPersistedBucket;
  }
  if (aiLabel === 'spam') {
    return 'spam';
  }
  const normalizedSemanticLabel = String(semanticLabel ?? '').trim().toLowerCase();
  if (textQuality?.isLowSignal === true || normalizedSemanticLabel === 'low_signal') {
    return 'low_signal';
  }
  const normalizedIssueTags = Array.isArray(issueTags)
    ? issueTags.map((tag) => String(tag ?? '').trim().toLowerCase())
    : [];
  if (normalizedIssueTags.some((tag) => tag === 'low_signal' || tag === 'needs_review' || tag === 'uninformative')) {
    return 'low_signal';
  }
  return 'valid';
}

function enrichFeedbackWithAiLabel(feedback, persistedAiLabelRaw = feedback.ai_label, classification = null) {
  const normalizedClassification = normalizeAiClassification(classification);
  const aiMeta =
    classification?.ai_meta && typeof classification.ai_meta === 'object' ? classification.ai_meta : null;
  const spamFromComment = classifyFeedbackSpam(feedback?.comment ?? '');
  const semanticFromComment = classifyFeedbackSemantics({
    comment: feedback?.comment ?? '',
    rating: feedback?.rating ?? null,
    isSpam: String(spamFromComment?.label ?? '').trim().toLowerCase() === 'spam',
  });

  const persistedLabel = normalizeSpamLabel(persistedAiLabelRaw);
  const aiLabel = persistedLabel ?? normalizedClassification.label ?? spamFromComment.label ?? 'not_spam';
  const aiReasons = normalizedClassification.reasons.length > 0 ? normalizedClassification.reasons : spamFromComment.reasons;

  const sentimentLabel = normalizedClassification.sentimentLabel ?? semanticFromComment.sentimentLabel;
  const incidentLabel = normalizedClassification.incidentLabel ?? semanticFromComment.incidentLabel;
  const semanticLabel = normalizedClassification.semanticLabel ?? semanticFromComment.semanticLabel;
  const semanticReasons =
    normalizedClassification.semanticReasons.length > 0
      ? normalizedClassification.semanticReasons
      : semanticFromComment.semanticReasons;
  const moderationLabels =
    normalizedClassification.moderationLabels.length > 0
      ? normalizedClassification.moderationLabels
      : Array.isArray(semanticFromComment.moderationLabels)
        ? semanticFromComment.moderationLabels
        : [];
  const semanticLabels =
    normalizedClassification.semanticLabels.length > 0
      ? normalizedClassification.semanticLabels
      : Array.isArray(semanticFromComment.semanticLabels)
        ? semanticFromComment.semanticLabels
        : [];
  const issueTags =
    normalizedClassification.issueTags.length > 0
      ? normalizedClassification.issueTags
      : Array.isArray(semanticFromComment.issueTags)
        ? semanticFromComment.issueTags
        : [];
  const confidence =
    normalizedClassification.confidence && typeof normalizedClassification.confidence === 'object'
      ? normalizedClassification.confidence
      : semanticFromComment?.confidence && typeof semanticFromComment.confidence === 'object'
        ? semanticFromComment.confidence
        : null;
  const textQuality =
    normalizedClassification.textQuality && typeof normalizedClassification.textQuality === 'object'
      ? normalizedClassification.textQuality
      : semanticFromComment?.textQuality && typeof semanticFromComment.textQuality === 'object'
        ? semanticFromComment.textQuality
        : null;
  const normalizedModerationLabels = Array.from(
    new Set([
      ...moderationLabels,
      aiLabel === 'spam' ? 'spam' : null,
      incidentLabel === 'incident' ? 'incident' : null,
      textQuality?.isLowSignal ? 'needs_review' : null,
      textQuality?.isLowSignal ? 'low_signal' : null,
    ].filter(Boolean))
  ).slice(0, 6);
  const normalizedIssueTags = Array.from(
    new Set([
      ...issueTags,
      textQuality?.isLowSignal ? 'low_signal' : null,
      textQuality?.isLowSignal ? 'needs_review' : null,
      textQuality?.label === 'uninformative' ? 'uninformative' : null,
    ].filter(Boolean))
  ).slice(0, 8);
  const feedbackBucket = resolveFeedbackBucket({
    aiLabel,
    semanticLabel,
    textQuality,
    issueTags: normalizedIssueTags,
    persistedBucket: normalizedClassification.feedbackBucket ?? feedback?.ai_feedback_bucket ?? null,
  });
  const finalLabel = pickFinalFeedbackLabel({
    comment: feedback?.comment ?? '',
    aiLabel,
    isSpam: aiLabel === 'spam',
    feedbackBucket,
    sentimentLabel,
    incidentLabel,
    semanticLabel,
    moderationLabels: normalizedModerationLabels,
    semanticLabels,
    issueTags: normalizedIssueTags,
    reasons: aiReasons,
    semanticReasons,
    textQualityLabel: textQuality?.label,
    sentimentConfidence: confidence?.sentiment,
    semanticConfidence: confidence?.semantic,
  });

  return {
    ...feedback,
    ai_label: aiLabel,
    is_spam: aiLabel === 'spam',
    ai_spam_reasons: aiReasons,
    ai_sentiment_label: sentimentLabel,
    ai_incident_label: incidentLabel,
    ai_semantic_label: semanticLabel,
    ai_semantic_reasons: semanticReasons,
    ai_moderation_labels: normalizedModerationLabels,
    ai_semantic_labels: Array.from(new Set(semanticLabels)).slice(0, 6),
    ai_issue_tags: normalizedIssueTags,
    ai_feedback_bucket: feedbackBucket,
    ai_confidence: confidence,
    ai_text_quality_is_low_signal: Boolean(textQuality?.isLowSignal),
    ai_text_quality_label: String(textQuality?.label ?? '').trim() || 'informative',
    ai_text_quality_reasons: Array.isArray(textQuality?.reasons)
      ? textQuality.reasons
          .map((reason) => String(reason ?? '').trim())
          .filter((reason) => reason.length > 0)
          .slice(0, 6)
      : [],
    final_label: normalizedClassification.finalLabel ?? finalLabel,
    finalLabel: normalizedClassification.finalLabel ?? finalLabel,
    ai_meta: aiMeta,
  };
}

function mapFeedbackRecord(feedback, layout) {
  const explicitFlagValue = layout.flagColumn ? feedback[layout.flagColumn] : null;
  const explicitAiLabelValue = layout.aiLabelColumn ? feedback[layout.aiLabelColumn] : feedback.ai_label;
  const inferredFlag = typeof explicitFlagValue === 'boolean' ? explicitFlagValue : inferIncidentFlag(feedback);
  const normalizedStatus = normalizeModerationStatus(layout.statusColumn ? feedback[layout.statusColumn] : null);

  return {
    ...enrichFeedbackWithAiLabel(feedback, explicitAiLabelValue),
    review_status: normalizedStatus,
    is_flagged: inferredFlag,
    flag_reason: layout.reasonColumn ? feedback[layout.reasonColumn] ?? null : null,
    reviewed_at: layout.reviewedAtColumn ? feedback[layout.reviewedAtColumn] ?? null : null,
    reviewed_by: layout.reviewedByColumn ? feedback[layout.reviewedByColumn] ?? null : null,
  };
}

function canReadFeedback(role, userId, feedback) {
  if (role === 'admin') {
    return true;
  }

  if (role === 'organizer') {
    return feedback.organizer_id === userId;
  }

  return feedback.volunteer_id === userId;
}

function canModerateFeedback(role, userId, feedback) {
  if (role === 'admin') {
    return true;
  }

  return role === 'organizer' && feedback.organizer_id === userId;
}

function parsePositiveInteger(value, fallbackValue, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallbackValue;
  }
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function escapeIlikePattern(value) {
  return String(value).replace(/[\\%_]/g, '\\$&');
}

function chunkArray(values, chunkSize = 200) {
  const source = Array.isArray(values) ? values : [];
  const chunks = [];
  for (let index = 0; index < source.length; index += chunkSize) {
    chunks.push(source.slice(index, index + chunkSize));
  }
  return chunks;
}

function formatIssueTagLabel(tag) {
  const normalized = String(tag ?? '').trim().toLowerCase();
  if (!normalized) {
    return '';
  }

  const byTag = {
    spam: 'Spam',
    safety: 'Safety',
    logistics: 'Logistics',
    communication: 'Communication',
    incident: 'Incident',
    negative: 'Negative sentiment',
    neutral: 'Neutral sentiment',
    positive: 'Positive sentiment',
  };
  return byTag[normalized] ?? normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function getIssuePriority(tag) {
  const normalized = String(tag ?? '').trim().toLowerCase();
  if (normalized === 'incident' || normalized === 'safety') {
    return 'high';
  }
  if (normalized === 'logistics' || normalized === 'communication' || normalized === 'negative') {
    return 'medium';
  }
  return 'low';
}

function normalizeFeedbackIssueTags(feedback) {
  if (Array.isArray(feedback?.ai_issue_tags)) {
    return feedback.ai_issue_tags
      .map((tag) => String(tag ?? '').trim().toLowerCase())
      .filter((tag) => tag.length > 0);
  }

  const fallbackTags = [];
  const textQualityLabel = String(feedback?.ai_text_quality_label ?? '').trim().toLowerCase();
  const textQualityLowSignal = feedback?.ai_text_quality_is_low_signal === true;
  const semanticLabel = String(feedback?.ai_semantic_label ?? '').trim().toLowerCase();
  const incidentLabel = String(feedback?.ai_incident_label ?? '').trim().toLowerCase();
  if (incidentLabel === 'incident') {
    fallbackTags.push('incident', 'safety');
  }
  if (semanticLabel === 'negative') {
    fallbackTags.push('negative');
  }
  if (textQualityLowSignal || semanticLabel === 'low_signal') {
    fallbackTags.push('low_signal', 'needs_review');
    if (textQualityLabel === 'uninformative') {
      fallbackTags.push('uninformative');
    }
  }
  return Array.from(new Set(fallbackTags));
}

function isLowSignalFeedback(feedback) {
  if (!feedback || typeof feedback !== 'object') {
    return false;
  }
  const bucket = normalizeFeedbackBucket(feedback.ai_feedback_bucket);
  if (bucket === 'low_signal') {
    return true;
  }
  if (bucket === 'spam') {
    return false;
  }
  if (feedback.ai_text_quality_is_low_signal === true) {
    return true;
  }
  const semanticLabel = String(feedback.ai_semantic_label ?? '').trim().toLowerCase();
  if (semanticLabel === 'low_signal') {
    return true;
  }
  const issueTags = normalizeFeedbackIssueTags(feedback);
  return issueTags.some((tag) => tag === 'low_signal' || tag === 'needs_review' || tag === 'uninformative');
}

function isValidInsightFeedback(feedback) {
  const bucket = normalizeFeedbackBucket(feedback?.ai_feedback_bucket);
  if (bucket === 'spam') {
    return false;
  }
  if (bucket === 'low_signal') {
    return false;
  }
  const isSpam = feedback?.is_spam === true;
  if (isSpam) {
    return false;
  }
  return !isLowSignalFeedback(feedback);
}

function toFeedbackInsights({ feedbacks, activityContextByParticipationId }) {
  const safeFeedbacks = Array.isArray(feedbacks) ? feedbacks : [];
  const activityContext =
    activityContextByParticipationId instanceof Map ? activityContextByParticipationId : new Map();
  const minValidFeedbackForInsights = 3;

  if (safeFeedbacks.length === 0) {
    return {
      totals: {
        feedback_count: 0,
        spam_count: 0,
        low_signal_count: 0,
        valid_feedback_count: 0,
        average_rating: 0,
        sentiment: { positive: 0, neutral: 0, negative: 0 },
      },
      repeatedIssues: [],
      strengths: [],
      weaknesses: [],
      prominentIssues: [],
      byActivity: [],
      scope: 'filtered_result',
      reliability: {
        reliable: false,
        min_valid_feedback_count: minValidFeedbackForInsights,
        message: 'Not enough high-quality feedback to generate reliable insights yet.',
      },
    };
  }

  let allRatingSum = 0;
  let allRatingCount = 0;
  let validRatingSum = 0;
  let validRatingCount = 0;
  let spamCount = 0;
  let lowSignalCount = 0;
  let positiveCount = 0;
  let neutralCount = 0;
  let negativeCount = 0;

  const repeatedIssueCounts = new Map();
  const byActivity = new Map();
  const validFeedbacks = [];

  for (const feedback of safeFeedbacks) {
    const rating = Number(feedback?.rating ?? 0);
    if (Number.isFinite(rating) && rating > 0) {
      allRatingSum += rating;
      allRatingCount += 1;
    }

    const feedbackBucket = normalizeFeedbackBucket(feedback?.ai_feedback_bucket);
    const isSpam = feedbackBucket === 'spam' || feedback?.is_spam === true;
    const isLowSignal = feedbackBucket === 'low_signal' || isLowSignalFeedback(feedback);
    if (isSpam) {
      spamCount += 1;
    }
    if (isLowSignal) {
      lowSignalCount += 1;
    }

    if (!isValidInsightFeedback(feedback)) {
      continue;
    }

    validFeedbacks.push(feedback);
    if (Number.isFinite(rating) && rating > 0) {
      validRatingSum += rating;
      validRatingCount += 1;
      if (rating >= 4) {
        positiveCount += 1;
      } else if (rating <= 2) {
        negativeCount += 1;
      } else {
        neutralCount += 1;
      }
    }

    const tags = normalizeFeedbackIssueTags(feedback);
    for (const tag of tags) {
      if (
        tag === 'positive' ||
        tag === 'neutral' ||
        tag === 'low_signal' ||
        tag === 'needs_review' ||
        tag === 'uninformative' ||
        tag === 'spam'
      ) {
        continue;
      }
      repeatedIssueCounts.set(tag, (repeatedIssueCounts.get(tag) ?? 0) + 1);
    }

    const participationId = String(feedback?.participation_id ?? '').trim();
    const context = activityContext.get(participationId) ?? null;
    const activityKey = String(context?.activity_id ?? 'unknown').trim() || 'unknown';
    const activityTitle = String(context?.activity_title ?? 'Unknown activity').trim() || 'Unknown activity';
    const current =
      byActivity.get(activityKey) ??
      {
        activityId: activityKey === 'unknown' ? null : activityKey,
        activityTitle,
        feedbackCount: 0,
        ratingSum: 0,
        ratingCount: 0,
        issueCounts: new Map(),
      };

    current.feedbackCount += 1;
    if (Number.isFinite(rating) && rating > 0) {
      current.ratingSum += rating;
      current.ratingCount += 1;
    }
    for (const tag of tags) {
      if (tag === 'positive' || tag === 'neutral') {
        continue;
      }
      current.issueCounts.set(tag, (current.issueCounts.get(tag) ?? 0) + 1);
    }
    byActivity.set(activityKey, current);
  }

  const averageRatingAll = allRatingCount > 0 ? Number((allRatingSum / allRatingCount).toFixed(2)) : 0;
  const averageRatingValid = validRatingCount > 0 ? Number((validRatingSum / validRatingCount).toFixed(2)) : 0;
  const hasReliableSample = validFeedbacks.length >= minValidFeedbackForInsights;

  if (!hasReliableSample) {
    return {
      totals: {
        feedback_count: safeFeedbacks.length,
        spam_count: spamCount,
        low_signal_count: lowSignalCount,
        valid_feedback_count: validFeedbacks.length,
        average_rating: averageRatingValid,
        average_rating_all: averageRatingAll,
        sentiment: {
          positive: positiveCount,
          neutral: neutralCount,
          negative: negativeCount,
        },
      },
      repeatedIssues: [],
      strengths: [],
      weaknesses: [],
      prominentIssues: [],
      byActivity: [],
      scope: 'filtered_result',
      reliability: {
        reliable: false,
        min_valid_feedback_count: minValidFeedbackForInsights,
        message: 'Not enough high-quality feedback to generate reliable insights yet.',
      },
    };
  }

  const repeatedIssues = Array.from(repeatedIssueCounts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 6)
    .map(([tag, count]) => ({
      tag,
      label: formatIssueTagLabel(tag),
      count,
      priority: getIssuePriority(tag),
    }));

  const strengths = [];
  if (positiveCount > 0) {
    strengths.push(`${positiveCount} valid feedback entries are positive.`);
  }
  if (averageRatingValid >= 4 && validRatingCount > 0) {
    strengths.push(`Average rating across valid feedback is ${averageRatingValid.toFixed(1)}/5.`);
  }
  if (repeatedIssues.length === 0) {
    strengths.push('No repeated operational issues detected across valid feedback.');
  }

  const weaknesses = [];
  if (negativeCount > 0) {
    weaknesses.push(`${negativeCount} valid feedback entries are negative.`);
  }
  if (repeatedIssues.length > 0) {
    weaknesses.push(...repeatedIssues.slice(0, 3).map((item) => `${item.label} reported ${item.count} times.`));
  }
  if (lowSignalCount > 0) {
    weaknesses.push(`${lowSignalCount} feedback entries are low-signal and excluded from insight scoring.`);
  }

  const byActivityRows = Array.from(byActivity.values())
    .map((item) => {
      const issueRows = Array.from(item.issueCounts.entries())
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 4)
        .map(([tag, count]) => ({
          tag,
          label: formatIssueTagLabel(tag),
          count,
          priority: getIssuePriority(tag),
        }));

      return {
        activityId: item.activityId,
        activityTitle: item.activityTitle,
        feedbackCount: item.feedbackCount,
        averageRating: item.ratingCount > 0 ? Number((item.ratingSum / item.ratingCount).toFixed(2)) : averageRatingValid,
        repeatedIssues: issueRows,
      };
    })
    .sort((left, right) => right.feedbackCount - left.feedbackCount || left.activityTitle.localeCompare(right.activityTitle))
    .slice(0, 8);

  return {
    totals: {
      feedback_count: safeFeedbacks.length,
      spam_count: spamCount,
      low_signal_count: lowSignalCount,
      valid_feedback_count: validFeedbacks.length,
      average_rating: averageRatingValid,
      average_rating_all: averageRatingAll,
      sentiment: {
        positive: positiveCount,
        neutral: neutralCount,
        negative: negativeCount,
      },
    },
    repeatedIssues,
    strengths,
    weaknesses,
    prominentIssues: repeatedIssues.slice(0, 3),
    byActivity: byActivityRows,
    scope: 'filtered_result',
    reliability: {
      reliable: true,
      min_valid_feedback_count: minValidFeedbackForInsights,
      message: '',
    },
  };
}

async function buildActivityContextByParticipationIds(feedbacks) {
  const participationIds = Array.from(
    new Set(
      (Array.isArray(feedbacks) ? feedbacks : [])
        .map((feedback) => String(feedback?.participation_id ?? '').trim())
        .filter((value) => value.length > 0)
    )
  );

  if (participationIds.length === 0) {
    return new Map();
  }

  const participationRows = [];
  for (const idChunk of chunkArray(participationIds, 200)) {
    const { data, error } = await supabaseAdmin
      .from('activity_participations')
      .select('id, activity_id')
      .in('id', idChunk);
    if (error) {
      throw new Error(error.message);
    }
    participationRows.push(...(data ?? []));
  }

  const activityIds = Array.from(new Set(participationRows.map((row) => row.activity_id).filter(Boolean)));
  const activitiesById = new Map();
  for (const idChunk of chunkArray(activityIds, 200)) {
    const { data, error } = await supabaseAdmin.from('activities').select('id, title').in('id', idChunk);
    if (error) {
      throw new Error(error.message);
    }
    for (const row of data ?? []) {
      activitiesById.set(row.id, String(row.title ?? 'Unknown activity'));
    }
  }

  const contextByParticipationId = new Map();
  for (const row of participationRows) {
    contextByParticipationId.set(row.id, {
      activity_id: row.activity_id ?? null,
      activity_title: row.activity_id ? activitiesById.get(row.activity_id) ?? 'Unknown activity' : 'Unknown activity',
    });
  }
  return contextByParticipationId;
}

async function queryFeedbackWithBestLayout(buildQuery, { allowFallback = true } = {}) {
  const layouts = allowFallback
    ? moderationColumnLayouts
    : moderationColumnLayouts.filter((layout) => layout.statusColumn || layout.flagColumn || layout.aiLabelColumn);

  for (const layout of layouts) {
    for (const includeAiLabel of [true, false]) {
      const selectColumns = createFeedbackSelectColumns(layout, { includeAiLabel });
      const { data, error, count } = await buildQuery(selectColumns, layout);

      if (!error) {
        return {
          data: data ?? [],
          layout: { ...layout, aiLabelColumn: includeAiLabel ? layout.aiLabelColumn : null },
          count: typeof count === 'number' ? count : null,
          error: null,
        };
      }

      if (isMissingColumnError(error) && includeAiLabel) {
        continue;
      }

      if (isMissingColumnError(error) && (layout.statusColumn || layout.flagColumn || layout.aiLabelColumn)) {
        break;
      }

      return { data: null, layout, error };
    }
  }

  return {
    data: null,
    layout: moderationColumnLayouts[moderationColumnLayouts.length - 1],
    error: new Error('Feedback moderation columns are not available in the current database schema.'),
  };
}

async function getFeedbackByIdWithBestLayout(feedbackId, { allowFallback = true } = {}) {
  const layouts = allowFallback
    ? moderationColumnLayouts
    : moderationColumnLayouts.filter((layout) => layout.statusColumn || layout.flagColumn || layout.aiLabelColumn);

  for (const layout of layouts) {
    for (const includeAiLabel of [true, false]) {
      const selectColumns = createFeedbackSelectColumns(layout, { includeAiLabel });
      const { data, error } = await supabaseAdmin
        .from('participation_feedback')
        .select(selectColumns)
        .eq('id', feedbackId)
        .maybeSingle();

      if (!error) {
        return {
          data: data ?? null,
          layout: { ...layout, aiLabelColumn: includeAiLabel ? layout.aiLabelColumn : null },
          error: null,
        };
      }

      if (isMissingColumnError(error) && includeAiLabel) {
        continue;
      }

      if (isMissingColumnError(error) && (layout.statusColumn || layout.flagColumn || layout.aiLabelColumn)) {
        break;
      }

      return { data: null, layout, error };
    }
  }

  return {
    data: null,
    layout: moderationColumnLayouts[moderationColumnLayouts.length - 1],
    error: new Error('Feedback moderation columns are not available in the current database schema.'),
  };
}

async function updateFeedbackWithBestLayout(feedbackId, buildPayload) {
  for (const layout of moderationColumnLayouts) {
    if (!layout.statusColumn && !layout.flagColumn && !layout.aiLabelColumn) {
      continue;
    }

    const payload = buildPayload(layout);
    if (!payload || Object.keys(payload).length === 0) {
      continue;
    }

    for (const includeAiLabel of [true, false]) {
      const { data, error } = await supabaseAdmin
        .from('participation_feedback')
        .update(payload)
        .eq('id', feedbackId)
        .select(createFeedbackSelectColumns(layout, { includeAiLabel }))
        .maybeSingle();

      if (!error) {
        return {
          data: data ?? null,
          layout: { ...layout, aiLabelColumn: includeAiLabel ? layout.aiLabelColumn : null },
          error: null,
        };
      }

      if (isMissingColumnError(error) && includeAiLabel) {
        continue;
      }

      if (isMissingColumnError(error)) {
        break;
      }

      return { data: null, layout, error };
    }
  }

  return {
    data: null,
    layout: moderationColumnLayouts[moderationColumnLayouts.length - 1],
    count: null,
    error: new Error('Feedback moderation columns are not available in the current database schema.'),
  };
}

async function queryFeedbackListWithAiLabel(buildQuery) {
  const selectColumnsCandidates = [
    `${feedbackColumns}, ai_label`,
    feedbackColumns,
  ];

  for (const selectColumns of selectColumnsCandidates) {
    const { data, error } = await buildQuery(selectColumns);
    if (!error) {
      return { data: data ?? [], error: null };
    }
    if (isMissingColumnError(error) && selectColumns.includes('ai_label')) {
      continue;
    }
    return { data: null, error };
  }

  return { data: null, error: new Error('Unable to query feedback list.') };
}

router.get('/feedback', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '');
  const mineDefault = role !== 'admin';
  let mine = mineDefault;

  if (typeof req.query.mine === 'string') {
    const normalizedMine = req.query.mine.trim().toLowerCase();
    if (normalizedMine === 'true') {
      mine = true;
    } else if (normalizedMine === 'false') {
      mine = false;
    } else {
      res.status(400).json({ message: 'mine must be true or false.' });
      return;
    }
  }

  if (!mine && role !== 'admin') {
    res.status(403).json({ message: 'Only admin can query all feedback.' });
    return;
  }

  const requestedLimit = Number(req.query.limit ?? 50);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 200)
    : 50;

  const participationId =
    typeof req.query.participationId === 'string'
      ? req.query.participationId.trim()
      : typeof req.query.participation_id === 'string'
        ? req.query.participation_id.trim()
        : '';
  const ratingFilterRaw = req.query.rating;
  let ratingFilter = null;

  if (participationId && !isUuid(participationId)) {
    res.status(400).json({ message: 'participationId must be a valid UUID.' });
    return;
  }

  if (typeof ratingFilterRaw === 'string' && ratingFilterRaw.trim().length > 0) {
    const parsedRating = Number(ratingFilterRaw);
    if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
      res.status(400).json({ message: 'rating must be an integer between 1 and 5.' });
      return;
    }
    ratingFilter = parsedRating;
  }

  const { data, error } = await queryFeedbackListWithAiLabel((selectColumns) => {
    let query = supabaseAdmin.from('participation_feedback').select(selectColumns).order('created_at', {
      ascending: false,
    });

    if (role === 'admin') {
      if (mine) {
        query = query.eq('volunteer_id', req.auth.user.id);
      }
    } else if (role === 'organizer') {
      query = query.eq('organizer_id', req.auth.user.id);
    } else {
      query = query.eq('volunteer_id', req.auth.user.id);
    }

    if (participationId) {
      query = query.eq('participation_id', participationId);
    }

    if (ratingFilter !== null) {
      query = query.eq('rating', ratingFilter);
    }

    return query.limit(limit);
  });
  if (error) {
    res.status(500).json({ message: error.message });
    return;
  }

  res.json({ feedbacks: (data ?? []).map((feedback) => enrichFeedbackWithAiLabel(feedback)) });
});

router.get('/feedback/review', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '').trim().toLowerCase();
  if (role !== 'admin' && role !== 'organizer') {
    res.status(403).json({ message: 'Organizer or admin role required.' });
    return;
  }

  const statusFilterRaw = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : 'all';
  if (statusFilterRaw !== 'all' && !moderationStatusValues.has(statusFilterRaw)) {
    res.status(400).json({
      message: `Invalid status filter. Allowed: all, ${Array.from(moderationStatusValues).join(', ')}`,
    });
    return;
  }

  let flaggedFilter = null;
  try {
    flaggedFilter = parseBooleanQuery(req.query.flagged ?? req.query.flag ?? null, 'flagged');
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'flagged must be true or false.' });
    return;
  }

  const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim().toLowerCase() : '';
  const limit = parsePositiveInteger(req.query.limit ?? 20, 20, { min: 1, max: 100 });
  const page = parsePositiveInteger(req.query.page ?? 1, 1, { min: 1, max: 100000 });
  const offset = (page - 1) * limit;
  const rangeTo = offset + limit - 1;
  const fallbackScanLimit = Math.min(Math.max(limit * page, 500), 5000);

  const ratingFilterRaw = req.query.rating;
  let ratingFilter = null;
  if (typeof ratingFilterRaw === 'string' && ratingFilterRaw.trim().length > 0) {
    const parsed = Number(ratingFilterRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
      res.status(400).json({ message: 'rating must be an integer between 1 and 5.' });
      return;
    }
    ratingFilter = parsed;
  }

  const { data, layout, count, error } = await queryFeedbackWithBestLayout((selectColumns, columnLayout) => {
    const needsInMemoryFallback =
      (statusFilterRaw !== 'all' && !columnLayout.statusColumn) || (flaggedFilter !== null && !columnLayout.flagColumn);

    let query = supabaseAdmin
      .from('participation_feedback')
      .select(selectColumns, { count: 'exact' })
      .order('created_at', { ascending: false });

    if (role === 'organizer') {
      query = query.eq('organizer_id', req.auth.user.id);
    }

    if (ratingFilter !== null) {
      query = query.eq('rating', ratingFilter);
    }

    if (statusFilterRaw !== 'all' && columnLayout.statusColumn) {
      query = query.eq(columnLayout.statusColumn, statusFilterRaw);
    }

    if (flaggedFilter !== null && columnLayout.flagColumn) {
      query = query.eq(columnLayout.flagColumn, flaggedFilter);
    }

    if (keyword.length > 0) {
      query = query.ilike('comment', `%${escapeIlikePattern(keyword)}%`);
    }

    if (needsInMemoryFallback) {
      query = query.limit(fallbackScanLimit);
    } else {
      query = query.range(offset, rangeTo);
    }

    return query;
  });

  if (error) {
    res.status(500).json({ message: error.message });
    return;
  }

  const reviewedFeedbacks = (data ?? []).map((feedback) => mapFeedbackRecord(feedback, layout));
  const needsInMemoryFallback = (statusFilterRaw !== 'all' && !layout.statusColumn) || (flaggedFilter !== null && !layout.flagColumn);
  const filteredFeedbacks = needsInMemoryFallback
    ? reviewedFeedbacks.filter((feedback) => {
        if (statusFilterRaw !== 'all' && feedback.review_status !== statusFilterRaw) {
          return false;
        }
        if (flaggedFilter !== null && feedback.is_flagged !== flaggedFilter) {
          return false;
        }
        return true;
      })
    : reviewedFeedbacks;

  const pagedFeedbacks = needsInMemoryFallback ? filteredFeedbacks.slice(offset, rangeTo + 1) : filteredFeedbacks;
  const total = needsInMemoryFallback ? filteredFeedbacks.length : Math.max(0, Number(count ?? 0));
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  let insights = {
    totals: {
      feedback_count: 0,
      spam_count: 0,
      low_signal_count: 0,
      valid_feedback_count: 0,
      average_rating: 0,
      sentiment: { positive: 0, neutral: 0, negative: 0 },
    },
    repeatedIssues: [],
    strengths: [],
    weaknesses: [],
    prominentIssues: [],
    byActivity: [],
    scope: 'filtered_result',
    reliability: {
      reliable: false,
      min_valid_feedback_count: 3,
      message: 'Not enough high-quality feedback to generate reliable insights yet.',
    },
  };
  try {
    const contextByParticipationId = await buildActivityContextByParticipationIds(filteredFeedbacks);
    insights = toFeedbackInsights({
      feedbacks: filteredFeedbacks,
      activityContextByParticipationId: contextByParticipationId,
    });
  } catch (insightError) {
    console.error(
      `[feedback.review] failed to build insights: ${
        insightError instanceof Error ? insightError.message : String(insightError)
      }`
    );
  }

  res.json({
    feedbacks: pagedFeedbacks,
    moderation: {
      statusWritable: Boolean(layout.statusColumn),
      flagWritable: Boolean(layout.flagColumn),
      labelWritable: Boolean(layout.aiLabelColumn),
    },
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasPrev,
      hasNext,
    },
    insights,
  });
});

router.get('/feedback/:id', requireAuth, async (req, res) => {
  const feedbackId = req.params.id;
  if (!isUuid(feedbackId)) {
    res.status(400).json({ message: 'feedback id must be a valid UUID.' });
    return;
  }

  const { data, layout, error } = await getFeedbackByIdWithBestLayout(feedbackId);
  if (error) {
    res.status(500).json({ message: error.message });
    return;
  }

  if (!data) {
    res.status(404).json({ message: 'Feedback not found.' });
    return;
  }

  const role = String(req.auth?.profile?.role ?? '').trim().toLowerCase();
  if (!canReadFeedback(role, req.auth.user.id, data)) {
    res.status(403).json({ message: 'You do not have permission to access this feedback.' });
    return;
  }

  res.json({
    feedback: mapFeedbackRecord(data, layout),
    moderation: {
      statusWritable: Boolean(layout.statusColumn),
      flagWritable: Boolean(layout.flagColumn),
      labelWritable: Boolean(layout.aiLabelColumn),
    },
  });
});

router.put('/feedback/:id/status', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '').trim().toLowerCase();
  if (role !== 'admin' && role !== 'organizer') {
    res.status(403).json({ message: 'Organizer or admin role required.' });
    return;
  }

  const feedbackId = req.params.id;
  if (!isUuid(feedbackId)) {
    res.status(400).json({ message: 'feedback id must be a valid UUID.' });
    return;
  }

  if (!isPlainObject(req.body)) {
    res.status(400).json({ message: 'Body must be a JSON object.' });
    return;
  }

  const nextStatus = typeof req.body.status === 'string' ? req.body.status.trim().toLowerCase() : '';
  if (!moderationStatusValues.has(nextStatus)) {
    res.status(400).json({ message: `status must be one of: ${Array.from(moderationStatusValues).join(', ')}` });
    return;
  }

  const { data: existingFeedback, error: existingError } = await supabaseAdmin
    .from('participation_feedback')
    .select(feedbackColumns)
    .eq('id', feedbackId)
    .maybeSingle();

  if (existingError) {
    res.status(500).json({ message: existingError.message });
    return;
  }

  if (!existingFeedback) {
    res.status(404).json({ message: 'Feedback not found.' });
    return;
  }

  if (!canModerateFeedback(role, req.auth.user.id, existingFeedback)) {
    res.status(403).json({ message: 'You do not have permission to moderate this feedback.' });
    return;
  }

  const now = new Date().toISOString();
  const { data, layout, error } = await updateFeedbackWithBestLayout(feedbackId, (columnLayout) => {
    if (!columnLayout.statusColumn) {
      return null;
    }

    const payload = {
      [columnLayout.statusColumn]: nextStatus,
    };

    if (columnLayout.reviewedAtColumn) {
      payload[columnLayout.reviewedAtColumn] = now;
    }
    if (columnLayout.reviewedByColumn) {
      payload[columnLayout.reviewedByColumn] = req.auth.user.id;
    }
    if (columnLayout.updatedAtColumn) {
      payload[columnLayout.updatedAtColumn] = now;
    }

    return payload;
  });

  if (error) {
    if (isModerationSchemaUnsupported(error)) {
      res.status(409).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: error.message });
    return;
  }

  if (!data) {
    res.status(404).json({ message: 'Feedback not found.' });
    return;
  }

  res.json({ feedback: mapFeedbackRecord(data, layout) });
});

router.put('/feedback/:id/ai-label', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '').trim().toLowerCase();
  if (role !== 'admin') {
    res.status(403).json({ message: 'Admin role required.' });
    return;
  }

  const feedbackId = req.params.id;
  if (!isUuid(feedbackId)) {
    res.status(400).json({ message: 'feedback id must be a valid UUID.' });
    return;
  }

  if (!isPlainObject(req.body)) {
    res.status(400).json({ message: 'Body must be a JSON object.' });
    return;
  }

  const labelRaw =
    typeof req.body.label === 'string'
      ? req.body.label
      : typeof req.body.aiLabel === 'string'
        ? req.body.aiLabel
        : null;
  if (labelRaw == null) {
    res.status(400).json({ message: 'label (or aiLabel) is required.' });
    return;
  }

  let nextAiLabel = null;
  try {
    nextAiLabel = parseManualAiLabelValue(labelRaw);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid label value.' });
    return;
  }

  const { data: existingFeedback, error: existingError } = await supabaseAdmin
    .from('participation_feedback')
    .select(feedbackColumns)
    .eq('id', feedbackId)
    .maybeSingle();
  if (existingError) {
    res.status(500).json({ message: existingError.message });
    return;
  }
  if (!existingFeedback) {
    res.status(404).json({ message: 'Feedback not found.' });
    return;
  }

  const now = new Date().toISOString();
  const { data, layout, error } = await updateFeedbackWithBestLayout(feedbackId, (columnLayout) => {
    if (!columnLayout.aiLabelColumn) {
      return null;
    }

    const payload = {
      [columnLayout.aiLabelColumn]: nextAiLabel,
    };

    if (columnLayout.reviewedAtColumn) {
      payload[columnLayout.reviewedAtColumn] = now;
    }
    if (columnLayout.reviewedByColumn) {
      payload[columnLayout.reviewedByColumn] = req.auth.user.id;
    }
    if (columnLayout.updatedAtColumn) {
      payload[columnLayout.updatedAtColumn] = now;
    }

    return payload;
  });

  if (error) {
    if (isModerationSchemaUnsupported(error) || isMissingColumnError(error)) {
      res.status(409).json({ message: 'ai_label column is not available in the current database schema.' });
      return;
    }
    res.status(500).json({ message: error.message });
    return;
  }

  if (!data) {
    res.status(404).json({ message: 'Feedback not found.' });
    return;
  }

  res.json({ feedback: mapFeedbackRecord(data, layout) });
});

router.put('/feedback/:id/flag', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '').trim().toLowerCase();
  if (role !== 'admin' && role !== 'organizer') {
    res.status(403).json({ message: 'Organizer or admin role required.' });
    return;
  }

  const feedbackId = req.params.id;
  if (!isUuid(feedbackId)) {
    res.status(400).json({ message: 'feedback id must be a valid UUID.' });
    return;
  }

  if (!isPlainObject(req.body)) {
    res.status(400).json({ message: 'Body must be a JSON object.' });
    return;
  }

  const hasFlagField = Object.hasOwn(req.body, 'flag') || Object.hasOwn(req.body, 'flagged');
  if (!hasFlagField) {
    res.status(400).json({ message: 'flag (or flagged) is required.' });
    return;
  }

  const nextFlagRaw = Object.hasOwn(req.body, 'flag') ? req.body.flag : req.body.flagged;
  if (typeof nextFlagRaw !== 'boolean') {
    res.status(400).json({ message: 'flag must be true or false.' });
    return;
  }
  const nextFlag = nextFlagRaw;

  const reasonRaw =
    typeof req.body.reason === 'string'
      ? req.body.reason
      : typeof req.body.flagReason === 'string'
        ? req.body.flagReason
        : '';
  const reason = reasonRaw.trim();
  if (reason.length > 1000) {
    res.status(400).json({ message: 'reason must be 1000 characters or fewer.' });
    return;
  }

  const { data: existingFeedback, error: existingError } = await supabaseAdmin
    .from('participation_feedback')
    .select(feedbackColumns)
    .eq('id', feedbackId)
    .maybeSingle();

  if (existingError) {
    res.status(500).json({ message: existingError.message });
    return;
  }

  if (!existingFeedback) {
    res.status(404).json({ message: 'Feedback not found.' });
    return;
  }

  if (!canModerateFeedback(role, req.auth.user.id, existingFeedback)) {
    res.status(403).json({ message: 'You do not have permission to moderate this feedback.' });
    return;
  }

  const now = new Date().toISOString();
  const { data, layout, error } = await updateFeedbackWithBestLayout(feedbackId, (columnLayout) => {
    if (!columnLayout.flagColumn) {
      return null;
    }

    const payload = {
      [columnLayout.flagColumn]: nextFlag,
    };

    if (columnLayout.reasonColumn) {
      payload[columnLayout.reasonColumn] = nextFlag ? reason || null : null;
    }
    if (columnLayout.reviewedAtColumn) {
      payload[columnLayout.reviewedAtColumn] = now;
    }
    if (columnLayout.reviewedByColumn) {
      payload[columnLayout.reviewedByColumn] = req.auth.user.id;
    }
    if (columnLayout.updatedAtColumn) {
      payload[columnLayout.updatedAtColumn] = now;
    }

    return payload;
  });

  if (error) {
    if (isModerationSchemaUnsupported(error)) {
      res.status(409).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: error.message });
    return;
  }

  if (!data) {
    res.status(404).json({ message: 'Feedback not found.' });
    return;
  }

  res.json({ feedback: mapFeedbackRecord(data, layout) });
});

router.post('/feedback', requireAuth, async (req, res) => {
  const role = String(req.auth?.profile?.role ?? '');
  if (role !== 'volunteer' && role !== 'admin') {
    res.status(403).json({ message: 'Only volunteers/admin can submit feedback.' });
    return;
  }

  let payload;
  try {
    payload = normalizeFeedbackPayload(req.body);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid payload.' });
    return;
  }

  const { data: participation, error: participationError } = await supabaseAdmin
    .from('activity_participations')
    .select('id, volunteer_id, activity_id, status')
    .eq('id', payload.participation_id)
    .maybeSingle();

  if (participationError) {
    res.status(500).json({ message: participationError.message });
    return;
  }

  if (!participation) {
    res.status(404).json({ message: 'Participation not found.' });
    return;
  }

  if (role !== 'admin' && participation.volunteer_id !== req.auth.user.id) {
    res.status(403).json({ message: 'You can submit feedback only for your own participation.' });
    return;
  }

  const participationStatus = String(participation.status ?? '').toLowerCase();
  if (!feedbackEligibleParticipationStatuses.has(participationStatus)) {
    res.status(400).json({ message: 'Feedback can be submitted only for approved or checked-in participations.' });
    return;
  }

  const { data: activity, error: activityError } = await supabaseAdmin
    .from('activities')
    .select('id, organizer_id, status')
    .eq('id', participation.activity_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (activityError) {
    res.status(500).json({ message: activityError.message });
    return;
  }

  if (!activity) {
    res.status(404).json({ message: 'Activity not found for this participation.' });
    return;
  }

  const activityStatus = String(activity.status ?? '').toLowerCase();
  if (participationStatus !== 'checked_in' && activityStatus !== 'completed') {
    res.status(400).json({ message: 'Feedback can be submitted only after the activity is completed.' });
    return;
  }

  const spamClassification = await classifyFeedback({
    comment: payload.comment,
    rating: payload.rating,
  });
  const baseInsertPayload = {
    participation_id: payload.participation_id,
    volunteer_id: participation.volunteer_id,
    organizer_id: activity.organizer_id ?? null,
    rating: payload.rating,
    comment: payload.comment,
  };
  let { data, error } = await supabaseAdmin
    .from('participation_feedback')
    .upsert(
      {
        ...baseInsertPayload,
        ai_label: spamClassification.label,
      },
      { onConflict: 'participation_id' }
    )
    .select(feedbackColumns)
    .maybeSingle();

  if (error && isMissingColumnError(error)) {
    const retryResult = await supabaseAdmin
      .from('participation_feedback')
      .upsert(baseInsertPayload, { onConflict: 'participation_id' })
      .select(feedbackColumns)
      .maybeSingle();
    data = retryResult.data;
    error = retryResult.error;
  }

  if (error) {
    if (error.code === '23514' || error.code === '22P02' || error.code === '23502' || error.code === '23503') {
      res.status(400).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: error.message });
    return;
  }

  res.status(201).json({
    feedback: data
      ? enrichFeedbackWithAiLabel({
          ...data,
          ai_label: spamClassification.label,
        }, spamClassification.label, spamClassification)
      : data,
  });
});

export default router;
