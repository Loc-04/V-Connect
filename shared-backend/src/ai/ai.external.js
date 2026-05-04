import {
  AI_EXTERNAL_PROVIDER,
  AI_CACHE_TTL_SECONDS,
  AI_EXTERNAL_TIMEOUT_MS,
  GEMINI_API_KEY,
  GEMINI_MODEL,
} from '../config/env.js';
import { normalizeFeedbackLabel } from '../feedback/feedback.final-label.js';
import * as aiInternal from './ai.internal.js';

const GEMINI_EXTERNAL_PROVIDER = 'gemini';
const MAX_RECOMMENDATION_REASONS = 3;
const MAX_FEEDBACK_REASONS = 4;
const MAX_RECOMMENDATION_EXPLANATION_LENGTH = 220;
const MAX_REPORT_SUMMARY_LENGTH = 640;
const EXTERNAL_CACHE = new Map();

function createExternalError(
  message,
  { statusCode = 502, code = 'EXTERNAL_AI_ERROR', feature = 'unknown' } = {}
) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.feature = feature;
  return error;
}

function normalizeText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function truncateText(value, maxLength) {
  const text = normalizeText(value);
  if (!text) {
    return '';
  }
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeConfidence(value, fallback = 0.5) {
  return Number(clamp(toFiniteNumber(value, fallback), 0, 1).toFixed(2));
}

function normalizeReasonList(values, maxItems = MAX_RECOMMENDATION_REASONS) {
  if (!Array.isArray(values)) {
    return [];
  }
  const normalized = values
    .map((value) => normalizeText(value))
    .filter((value) => value.length > 0)
    .map((value) => truncateText(value, 100));
  return Array.from(new Set(normalized)).slice(0, maxItems);
}

function parseJsonPayload(rawValue, { feature = 'unknown' } = {}) {
  const input = String(rawValue ?? '').trim();
  if (!input) {
    throw createExternalError('External AI returned an empty response body.', {
      statusCode: 502,
      code: 'EXTERNAL_EMPTY_RESPONSE',
      feature,
    });
  }

  const fenced = input.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : input;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw createExternalError('External AI response is not valid JSON.', {
        statusCode: 502,
        code: 'EXTERNAL_INVALID_JSON',
        feature,
      });
    }

    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      throw createExternalError('External AI response is not valid JSON.', {
        statusCode: 502,
        code: 'EXTERNAL_INVALID_JSON',
        feature,
      });
    }
  }
}

function deepClone(value) {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
}

function getCacheEntry(cacheKey) {
  if (AI_CACHE_TTL_SECONDS <= 0) {
    return null;
  }
  const record = EXTERNAL_CACHE.get(cacheKey);
  if (!record) {
    return null;
  }
  if (record.expiresAt <= Date.now()) {
    EXTERNAL_CACHE.delete(cacheKey);
    return null;
  }
  return deepClone(record.value);
}

function setCacheEntry(cacheKey, value) {
  if (AI_CACHE_TTL_SECONDS <= 0) {
    return;
  }
  EXTERNAL_CACHE.set(cacheKey, {
    expiresAt: Date.now() + AI_CACHE_TTL_SECONDS * 1000,
    value: deepClone(value),
  });
}

async function withExternalCache(cacheScope, payload, loader) {
  const cacheKey = `${cacheScope}:${JSON.stringify(payload ?? {})}`;
  const cached = getCacheEntry(cacheKey);
  if (cached != null) {
    return cached;
  }
  const result = await loader();
  setCacheEntry(cacheKey, result);
  return deepClone(result);
}

async function fetchWithTimeout(url, options, timeoutMs = AI_EXTERNAL_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw createExternalError(`External AI request timed out after ${timeoutMs}ms.`, {
        statusCode: 504,
        code: 'EXTERNAL_AI_TIMEOUT',
      });
    }
    throw createExternalError(
      `External AI request failed: ${error instanceof Error ? error.message : String(error)}.`
    );
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function callGeminiJson({ systemPrompt, userPrompt, feature }) {
  if (!GEMINI_API_KEY) {
    throw createExternalError('GEMINI_API_KEY is missing for Gemini external AI provider.', {
      statusCode: 503,
      code: 'EXTERNAL_PROVIDER_NOT_CONFIGURED',
      feature,
    });
  }

  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          role: 'system',
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      }),
    },
    AI_EXTERNAL_TIMEOUT_MS
  );

  if (!response.ok) {
    const body = await response.text();
    throw createExternalError(`Gemini API error (${response.status}): ${body || 'no response body'}.`, {
      statusCode: 502,
      code: 'GEMINI_API_ERROR',
      feature,
    });
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return parseJsonPayload(text, { feature });
}

async function callExternalJson({ systemPrompt, userPrompt, feature }) {
  if (AI_EXTERNAL_PROVIDER !== GEMINI_EXTERNAL_PROVIDER) {
    throw createExternalError(
      `Unsupported AI_EXTERNAL_PROVIDER="${AI_EXTERNAL_PROVIDER}". Expected "${GEMINI_EXTERNAL_PROVIDER}".`,
      {
        statusCode: 503,
        code: 'EXTERNAL_PROVIDER_NOT_CONFIGURED',
        feature,
      }
    );
  }
  return callGeminiJson({ systemPrompt, userPrompt, feature });
}

function attachExternalMeta(payload, feature, extras = {}) {
  const existing = payload?.ai_meta && typeof payload.ai_meta === 'object' ? payload.ai_meta : {};
  return {
    ...payload,
    ai_meta: {
      ...existing,
      feature,
      provider: 'external',
      external_provider: AI_EXTERNAL_PROVIDER,
      model: GEMINI_MODEL,
      fallback_used: false,
      fallback_reason: null,
      ...extras,
    },
  };
}

function collectCandidateIdSet(items, idField) {
  return new Set(
    items
      .map((item) => normalizeText(item?.[idField]))
      .filter((id) => id.length > 0)
  );
}

function mapItemById(items, idField) {
  return new Map(
    items
      .map((item) => [normalizeText(item?.[idField]), item])
      .filter(([id]) => id.length > 0)
  );
}

function validateRecommendationRewritePayload(payload, { allowedIds }) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw createExternalError('External recommendation response must be a JSON object.', {
      code: 'EXTERNAL_SCHEMA_MISMATCH',
      feature: 'recommend',
    });
  }

  if (!Array.isArray(payload.items)) {
    throw createExternalError('External recommendation response must include items array.', {
      code: 'EXTERNAL_SCHEMA_MISMATCH',
      feature: 'recommend',
    });
  }

  const byId = new Map();
  for (const rawItem of payload.items) {
    const id = normalizeText(rawItem?.id);
    if (!id || !allowedIds.has(id) || byId.has(id)) {
      continue;
    }

    const displayExplanation = truncateText(rawItem?.display_explanation, MAX_RECOMMENDATION_EXPLANATION_LENGTH);
    const displayReasons = normalizeReasonList(rawItem?.display_reasons, MAX_RECOMMENDATION_REASONS);
    const confidence = normalizeConfidence(rawItem?.confidence, 0.7);

    if (!displayExplanation && displayReasons.length === 0) {
      continue;
    }

    byId.set(id, {
      display_explanation: displayExplanation,
      display_reasons: displayReasons,
      confidence,
    });
  }

  if (byId.size === 0) {
    throw createExternalError('External recommendation response has no valid candidate ids.', {
      code: 'EXTERNAL_SCHEMA_MISMATCH',
      feature: 'recommend',
    });
  }

  return {
    byId,
    summary: truncateText(payload.summary, 280),
  };
}

function mergeRecommendationItems(baseItems, { idField, rewrittenById }) {
  return baseItems.map((item) => {
    const id = normalizeText(item?.[idField]);
    const rewritten = rewrittenById.get(id);
    if (!rewritten) {
      return item;
    }

    const displayReasons =
      rewritten.display_reasons.length > 0
        ? rewritten.display_reasons
        : normalizeReasonList(item?.display_reasons ?? item?.reasons, MAX_RECOMMENDATION_REASONS);
    const displayExplanation =
      rewritten.display_explanation ||
      truncateText(item?.display_explanation ?? item?.explanation, MAX_RECOMMENDATION_EXPLANATION_LENGTH);

    return {
      ...item,
      display_explanation: displayExplanation || (item?.display_explanation ?? item?.explanation),
      display_reasons: displayReasons,
      explanation: displayExplanation || item?.explanation,
      reasons: displayReasons.length > 0 ? displayReasons : item?.reasons,
    };
  });
}

async function recommend(input = {}) {
  const scope = normalizeText(input?.scope, 'user').toLowerCase();
  const base = await aiInternal.recommend(input);

  if (scope === 'match') {
    const aiResult = await withExternalCache('external:recommend:match:v2', input, async () =>
      callExternalJson({
        feature: 'recommend',
        systemPrompt:
          'Rewrite one recommendation explanation grounded only in provided signals. Return strict JSON: {"items":[{"id":"match_target","display_explanation":"...","display_reasons":["..."],"confidence":0.0}]}',
        userPrompt: JSON.stringify({
          task: 'Rewrite explanation in natural, concise wording. Never invent facts.',
          candidate: {
            id: 'match_target',
            matchScore: base?.matchScore ?? null,
            reason_codes: base?.reason_codes ?? [],
            score_breakdown: base?.score_breakdown ?? null,
            feature_contributions: base?.feature_contributions ?? [],
            display_explanation: base?.display_explanation ?? base?.explanation ?? '',
            display_reasons: base?.display_reasons ?? base?.reasons ?? [],
            model_kind: base?.model_kind ?? null,
            model_version: base?.model_version ?? null,
          },
        }),
      })
    );

    const validated = validateRecommendationRewritePayload(aiResult, {
      allowedIds: new Set(['match_target']),
    });
    const rewritten = validated.byId.get('match_target');
    if (!rewritten) {
      throw createExternalError('External recommendation output missing match_target.', {
        code: 'EXTERNAL_SCHEMA_MISMATCH',
        feature: 'recommend',
      });
    }

    const displayReasons =
      rewritten.display_reasons.length > 0
        ? rewritten.display_reasons
        : normalizeReasonList(base?.display_reasons ?? base?.reasons, MAX_RECOMMENDATION_REASONS);
    const displayExplanation =
      rewritten.display_explanation ||
      truncateText(base?.display_explanation ?? base?.explanation, MAX_RECOMMENDATION_EXPLANATION_LENGTH);

    return attachExternalMeta(
      {
        ...base,
        display_explanation: displayExplanation || (base?.display_explanation ?? base?.explanation),
        display_reasons: displayReasons,
        explanation: displayExplanation || base?.explanation,
        reasons: displayReasons.length > 0 ? displayReasons : base?.reasons,
      },
      'recommend',
      {
        external_summary: validated.summary || null,
      }
    );
  }

  const listField =
    scope === 'activity' ? 'volunteers' : Array.isArray(base?.activities) ? 'activities' : 'volunteers';
  const idField = listField === 'activities' ? 'activityId' : 'userId';
  const baseItems = Array.isArray(base?.[listField]) ? base[listField] : [];
  if (baseItems.length === 0) {
    return attachExternalMeta(base, 'recommend', {
      provider: 'internal',
      fallback_used: true,
      fallback_reason: 'empty_candidate_list',
    });
  }

  const candidateIdSet = collectCandidateIdSet(baseItems, idField);
  const baseItemById = mapItemById(baseItems, idField);
  if (candidateIdSet.size === 0) {
    return attachExternalMeta(base, 'recommend', {
      provider: 'internal',
      fallback_used: true,
      fallback_reason: 'invalid_candidate_ids',
    });
  }

  const aiResult = await withExternalCache(`external:recommend:${scope}:v2`, input, async () =>
    callExternalJson({
      feature: 'recommend',
      systemPrompt:
        'You only rewrite recommendation explanations. Never create new candidates or ids. Return strict JSON: {"items":[{"id":"candidate_id","display_explanation":"...","display_reasons":["..."],"confidence":0.0}],"summary":"optional"}',
      userPrompt: JSON.stringify({
        task: 'Rewrite explanation and 2-3 grounded reasons for each candidate.',
        constraints: {
          max_reasons: 3,
          max_explanation_chars: MAX_RECOMMENDATION_EXPLANATION_LENGTH,
          do_not_change_score: true,
          do_not_create_new_candidates: true,
        },
        scope,
        candidates: Array.from(candidateIdSet).map((id) => {
          const item = baseItemById.get(id);
          return {
            id,
            matchScore: item?.matchScore ?? null,
            reason_codes: item?.reason_codes ?? [],
            score_breakdown: item?.score_breakdown ?? null,
            feature_contributions: item?.feature_contributions ?? [],
            display_explanation: item?.display_explanation ?? item?.explanation ?? '',
            display_reasons: item?.display_reasons ?? item?.reasons ?? [],
            model_kind: item?.model_kind ?? null,
            model_version: item?.model_version ?? null,
          };
        }),
      }),
    })
  );

  const validated = validateRecommendationRewritePayload(aiResult, {
    allowedIds: candidateIdSet,
  });

  const rewrittenItems = mergeRecommendationItems(baseItems, {
    idField,
    rewrittenById: validated.byId,
  });

  return attachExternalMeta(
    {
      ...base,
      [listField]: rewrittenItems,
    },
    'recommend',
    {
      external_summary: validated.summary || null,
    }
  );
}

function normalizeExternalFeedbackLabel(rawLabel) {
  const label = normalizeFeedbackLabel(rawLabel);
  if (label === 'Spam') {
    return 'Neutral';
  }
  return label;
}

function normalizeExternalSentiment(rawValue) {
  const normalized = normalizeText(rawValue).toLowerCase();
  if (normalized === 'positive' || normalized === 'neutral' || normalized === 'negative') {
    return normalized;
  }
  if (normalized === 'not_available' || normalized === 'not available' || normalized === 'n/a') {
    return null;
  }
  return null;
}

function deriveSemanticLabelFromFinalLabel(finalLabel) {
  if (finalLabel === 'Incident') {
    return 'incident';
  }
  if (finalLabel === 'Positive') {
    return 'positive';
  }
  if (finalLabel === 'Negative') {
    return 'negative';
  }
  return 'neutral';
}

function deriveIncidentLabelFromFinalLabel(finalLabel) {
  return finalLabel === 'Incident' ? 'incident' : 'none';
}

function toSpamFirstResult(baseClassification, reason) {
  const reasons = normalizeReasonList(
    [reason, ...(Array.isArray(baseClassification?.reasons) ? baseClassification.reasons : [])],
    MAX_FEEDBACK_REASONS
  );
  return {
    ...baseClassification,
    label: 'spam',
    isSpam: true,
    feedbackBucket: 'spam',
    finalLabel: 'Spam',
    final_label: 'Spam',
    reasons,
  };
}

async function classifyFeedback(input = {}) {
  const comment = normalizeText(input?.comment);
  const base = await aiInternal.classifyFeedback(input);

  if (!comment) {
    return attachExternalMeta(base, 'classify', {
      provider: 'internal',
      fallback_used: true,
      fallback_reason: 'empty_comment',
    });
  }

  const baseBucket = normalizeText(base?.feedbackBucket).toLowerCase();
  const baseLabel = normalizeText(base?.label).toLowerCase();
  const isLowSignal = Boolean(base?.textQuality?.isLowSignal);
  if (baseLabel === 'spam' || baseBucket === 'spam') {
    return attachExternalMeta(toSpamFirstResult(base, 'spam_first_internal_filter'), 'classify', {
      provider: 'internal',
      fallback_used: true,
      fallback_reason: 'spam_first_internal_filter',
    });
  }
  if (baseBucket === 'low_signal' || isLowSignal) {
    return attachExternalMeta(toSpamFirstResult(base, 'low_signal_internal_filter'), 'classify', {
      provider: 'internal',
      fallback_used: true,
      fallback_reason: 'low_signal_internal_filter',
    });
  }

  const aiResult = await withExternalCache(
    'external:classifyFeedback:v2',
    { comment, rating: input?.rating ?? null },
    async () =>
      callExternalJson({
        feature: 'classify',
        systemPrompt:
          'Classify valid feedback sentiment/incident only. Return strict JSON: {"finalLabel":"Positive|Neutral|Negative|Incident","sentiment":"positive|neutral|negative|not_available","summary":"...","reason":"...","confidence":0.0}',
        userPrompt: JSON.stringify({
          task: 'Classify final feedback label for a valid feedback comment.',
          constraints: {
            spam_override_forbidden: true,
            one_final_label_only: true,
            no_extra_tags_in_output: true,
          },
          feedback: {
            rating: input?.rating ?? null,
            comment,
          },
          baseline: {
            finalLabel: base?.finalLabel ?? base?.final_label ?? null,
            sentimentLabel: base?.sentimentLabel ?? null,
            semanticLabel: base?.semanticLabel ?? null,
          },
        }),
      })
  );

  const finalLabel = normalizeExternalFeedbackLabel(aiResult?.finalLabel);
  if (!['Positive', 'Neutral', 'Negative', 'Incident'].includes(finalLabel)) {
    throw createExternalError('External feedback response has invalid finalLabel.', {
      code: 'EXTERNAL_SCHEMA_MISMATCH',
      feature: 'classify',
    });
  }

  const sentiment = normalizeExternalSentiment(aiResult?.sentiment);
  const reason = truncateText(aiResult?.reason, 200);
  const summary = truncateText(aiResult?.summary, 240);
  const confidence = normalizeConfidence(aiResult?.confidence, 0.65);
  const reasons = normalizeReasonList([reason, ...(Array.isArray(base?.reasons) ? base.reasons : [])], MAX_FEEDBACK_REASONS);

  return attachExternalMeta(
    {
      ...base,
      label: 'not_spam',
      isSpam: false,
      feedbackBucket: 'valid',
      finalLabel,
      final_label: finalLabel,
      sentimentLabel: sentiment ?? base?.sentimentLabel ?? null,
      semanticLabel: deriveSemanticLabelFromFinalLabel(finalLabel),
      incidentLabel: deriveIncidentLabelFromFinalLabel(finalLabel),
      reasons,
      semanticReasons: normalizeReasonList([summary || reason, ...(Array.isArray(base?.semanticReasons) ? base.semanticReasons : [])], 4),
      confidence: {
        sentiment: confidence,
        incident: finalLabel === 'Incident' ? confidence : Number(toFiniteNumber(base?.confidence?.incident, 0)),
        semantic: confidence,
      },
    },
    'classify'
  );
}

function normalizeStringArray(values, maxItems, maxCharsPerItem = 180) {
  if (!Array.isArray(values)) {
    return [];
  }
  return Array.from(
    new Set(
      values
        .map((value) => truncateText(value, maxCharsPerItem))
        .filter((value) => value.length > 0)
    )
  ).slice(0, maxItems);
}

function validateReportNarrativePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw createExternalError('External report response must be a JSON object.', {
      code: 'EXTERNAL_SCHEMA_MISMATCH',
      feature: 'summarize',
    });
  }

  const executiveSummary = truncateText(payload.executive_summary, MAX_REPORT_SUMMARY_LENGTH);
  if (!executiveSummary) {
    throw createExternalError('External report response missing executive_summary.', {
      code: 'EXTERNAL_SCHEMA_MISMATCH',
      feature: 'summarize',
    });
  }

  return {
    executive_summary: executiveSummary,
    strengths: normalizeStringArray(payload.strengths, 6),
    weaknesses: normalizeStringArray(payload.weaknesses, 6),
    recommended_actions: normalizeStringArray(payload.recommended_actions, 6),
    risk_notes: normalizeStringArray(payload.risk_notes, 6),
  };
}

function buildReportFactBundle(report) {
  const stats = report?.feedbackStats && typeof report.feedbackStats === 'object' ? report.feedbackStats : {};
  return {
    activityTitle: report?.activityTitle ?? null,
    duration: report?.durationValue ?? null,
    totalFeedbackCount: Number(stats.totalCount ?? 0),
    validFeedbackCount: Number(stats.validCount ?? 0),
    spamCount: Number(stats.spamCount ?? 0),
    lowSignalCount: Number(stats.lowSignalCount ?? 0),
    averageRatingValidOnly: report?.feedbackRating ?? null,
    sentimentChips: Array.isArray(report?.sentimentChips) ? report.sentimentChips : [],
    strengths: Array.isArray(report?.strengths) ? report.strengths : [],
    weaknesses: Array.isArray(report?.weaknesses) ? report.weaknesses : [],
    repeatedIssues: Array.isArray(report?.issueHighlights) ? report.issueHighlights : [],
    participationBreakdown: Array.isArray(report?.participationBreakdown) ? report.participationBreakdown : [],
    analyticsFacts: Array.isArray(report?.analyticsFacts) ? report.analyticsFacts : [],
    existingSummary: report?.summary ?? '',
  };
}

async function summarizeReport(input = {}) {
  const base = await aiInternal.summarizeReport(input);
  const report = base?.report ?? null;
  if (!report) {
    return attachExternalMeta(base, 'summarize', {
      provider: 'internal',
      fallback_used: true,
      fallback_reason: 'missing_report_payload',
    });
  }

  const factBundle = buildReportFactBundle(report);
  const aiResult = await withExternalCache(
    'external:summarizeReport:v2',
    {
      organizerId: input?.organizerId ?? null,
      activityId: input?.activityId ?? null,
      modelVersion: report?.modelVersion ?? null,
      factBundle,
    },
    async () =>
      callExternalJson({
        feature: 'summarize',
        systemPrompt:
          'Rewrite report narrative using only provided facts. Do not invent numbers. Return strict JSON: {"executive_summary":"...","strengths":["..."],"weaknesses":["..."],"recommended_actions":["..."],"risk_notes":["..."]}',
        userPrompt: JSON.stringify({
          task: 'Produce concise organizer narrative from deterministic report facts.',
          constraints: {
            no_new_numbers: true,
            no_fabricated_claims: true,
            mention_low_data_when_needed: true,
          },
          facts: factBundle,
        }),
      })
  );

  const validated = validateReportNarrativePayload(aiResult);
  const validFeedbackCount = Number(factBundle.validFeedbackCount ?? 0);
  const summaryForOutput =
    validFeedbackCount <= 0
      ? report.summary
      : validated.executive_summary;

  return attachExternalMeta(
    {
      ...base,
      report: {
        ...report,
        summary: summaryForOutput,
        strengths: validated.strengths.length > 0 ? validated.strengths : report.strengths,
        weaknesses: validated.weaknesses.length > 0 ? validated.weaknesses : report.weaknesses,
        externalNarrative: {
          recommended_actions: validated.recommended_actions,
          risk_notes: validated.risk_notes,
        },
      },
    },
    'summarize'
  );
}

export { recommend, classifyFeedback, summarizeReport };
