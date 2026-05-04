import {
  AI_EXTERNAL_PROVIDER,
  AI_CACHE_TTL_SECONDS,
  AI_TIMEOUT_MS,
  GEMINI_API_KEY,
} from '../config/env.js';
import { pickFinalFeedbackLabel } from '../feedback/feedback.final-label.js';
import * as aiInternal from './ai.internal.js';

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_EXTERNAL_PROVIDER = 'gemini';
const MAX_FEEDBACK_REASON_COUNT = 4;
const EXTERNAL_CACHE = new Map();

function createExternalError(message, { statusCode = 502, code = 'EXTERNAL_AI_ERROR' } = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function normalizeText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function normalizeReasonList(values, maxItems = MAX_FEEDBACK_REASON_COUNT) {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized = values
    .map((value) => String(value ?? '').trim())
    .filter((value) => value.length > 0);

  return Array.from(new Set(normalized)).slice(0, maxItems);
}

function normalizeMatchScore(value, fallback = 0) {
  const score = Number(value);
  if (!Number.isFinite(score)) {
    return Math.max(0, Math.min(100, Math.round(fallback)));
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalizeMatchRatio(value, fallbackScore = 0) {
  const ratio = Number(value);
  if (!Number.isFinite(ratio)) {
    return Number((normalizeMatchScore(fallbackScore) / 100).toFixed(2));
  }
  return Number(Math.max(0, Math.min(1, ratio)).toFixed(2));
}

function parseJsonPayload(rawValue) {
  const input = String(rawValue ?? '').trim();
  if (!input) {
    throw createExternalError('External AI returned an empty response body.');
  }

  const fenced = input.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : input;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw createExternalError('External AI response is not valid JSON.');
    }

    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      throw createExternalError('External AI response is not valid JSON.');
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

async function fetchWithTimeout(url, options, timeoutMs = AI_TIMEOUT_MS) {
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
    throw createExternalError(`External AI request failed: ${error instanceof Error ? error.message : String(error)}.`);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function callGeminiJson({ systemPrompt, userPrompt }) {
  if (!GEMINI_API_KEY) {
    throw createExternalError('GEMINI_API_KEY is missing for Gemini external AI provider.', {
      statusCode: 503,
      code: 'EXTERNAL_PROVIDER_NOT_CONFIGURED',
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
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw createExternalError(`Gemini API error (${response.status}): ${body || 'no response body'}.`, {
      statusCode: 502,
      code: 'GEMINI_API_ERROR',
    });
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return parseJsonPayload(text);
}

async function callExternalJson({ systemPrompt, userPrompt }) {
  if (AI_EXTERNAL_PROVIDER !== GEMINI_EXTERNAL_PROVIDER) {
    throw createExternalError(
      `Unsupported AI_EXTERNAL_PROVIDER="${AI_EXTERNAL_PROVIDER}". Gemini-only external mode requires AI_EXTERNAL_PROVIDER=gemini.`,
      {
        statusCode: 503,
        code: 'EXTERNAL_PROVIDER_NOT_CONFIGURED',
      }
    );
  }

  return callGeminiJson({ systemPrompt, userPrompt });
}

function normalizeRankedResults(baseItems, rankedItems, idField) {
  const baseById = new Map(
    baseItems.map((item) => [String(item?.[idField] ?? '').trim(), item]).filter(([id]) => id.length > 0)
  );

  const usedIds = new Set();
  const merged = [];

  if (Array.isArray(rankedItems)) {
    for (const row of rankedItems) {
      const id = String(row?.id ?? '').trim();
      if (!id || usedIds.has(id)) {
        continue;
      }

      const base = baseById.get(id);
      if (!base) {
        continue;
      }

      const score = normalizeMatchScore(row?.matchScore, base.matchScore);
      const reason = normalizeText(row?.reason, '');
      const reasons = reason
        ? normalizeReasonList([reason, ...(Array.isArray(base.reasons) ? base.reasons : [])], 4)
        : normalizeReasonList(base.reasons, 4);

      merged.push({
        ...base,
        matchScore: score,
        matchRatio: normalizeMatchRatio(row?.matchRatio, score),
        explanation: reason || normalizeText(base.explanation, 'Ranked by external AI provider.'),
        reasons,
      });
      usedIds.add(id);
    }
  }

  for (const base of baseItems) {
    const id = String(base?.[idField] ?? '').trim();
    if (!id || usedIds.has(id)) {
      continue;
    }
    merged.push(base);
  }

  return merged;
}

async function recommend(input = {}) {
  const scope = String(input?.scope ?? 'user').trim().toLowerCase();
  const base = await aiInternal.recommend(input);

  if (scope === 'match') {
    return withExternalCache('recommend:match', input, async () => {
      const aiResult = await callExternalJson({
        systemPrompt:
          'You evaluate volunteer activity matching. Return strict JSON with keys: matchScore (0-100 number), matchRatio (0-1 number), explanation (string), reasons (array of short strings).',
        userPrompt: JSON.stringify({
          task: 'Refine a volunteer-activity match score from baseline signals.',
          baseline: base,
          volunteerId: input?.volunteerId ?? null,
          activity: input?.activity ?? null,
        }),
      });

      const score = normalizeMatchScore(aiResult?.matchScore, base?.matchScore ?? 0);
      const ratio = normalizeMatchRatio(aiResult?.matchRatio, score);
      const explanation = normalizeText(aiResult?.explanation, normalizeText(base?.explanation));
      const reasons = normalizeReasonList(
        Array.isArray(aiResult?.reasons) ? aiResult.reasons : base?.reasons,
        4
      );

      return {
        matchScore: score,
        matchRatio: ratio,
        explanation,
        reasons,
      };
    });
  }

  const listField =
    scope === 'activity' ? 'volunteers' : Array.isArray(base?.activities) ? 'activities' : 'volunteers';
  const idField = listField === 'activities' ? 'activityId' : 'userId';
  const baseItems = Array.isArray(base?.[listField]) ? base[listField] : [];

  if (baseItems.length === 0) {
    return base;
  }

  const ranked = await withExternalCache(`recommend:list:${scope}`, input, async () => {
    const aiResult = await callExternalJson({
      systemPrompt:
        'You rerank volunteer recommendations. Return strict JSON only: {"ranked":[{"id":"string","matchScore":0-100 number,"matchRatio":0-1 number optional,"reason":"short explanation"}]}. Keep ids from the provided candidates only.',
      userPrompt: JSON.stringify({
        task: 'Rerank recommendation candidates with concise reasoning.',
        scope,
        candidates: baseItems.map((item) => ({
          id: item?.[idField],
          name: item?.title ?? item?.fullName ?? null,
          matchScore: item?.matchScore,
          reasons: item?.reasons ?? [],
          explanation: item?.explanation ?? '',
          skills: item?.skills ?? item?.requiredSkills ?? [],
          interests: item?.interests ?? [],
          availabilitySummary: item?.availabilitySummary ?? null,
        })),
      }),
    });

    return normalizeRankedResults(baseItems, aiResult?.ranked, idField);
  });

  return {
    ...base,
    [listField]: ranked,
  };
}

async function classifyFeedback(input = {}) {
  const comment = String(input?.comment ?? '').trim();
  if (!comment) {
    const finalLabel = pickFinalFeedbackLabel({ comment, label: 'not_spam', isSpam: false });
    return {
      label: 'not_spam',
      isSpam: false,
      finalLabel,
      final_label: finalLabel,
      reasons: [],
    };
  }

  return withExternalCache('classifyFeedback', { comment, rating: input?.rating ?? null }, async () => {
    const aiResult = await callExternalJson({
      systemPrompt:
        'Classify user feedback moderation risk. Return strict JSON only with keys: label ("spam" or "not_spam"), reasons (array of short strings).',
      userPrompt: JSON.stringify({
        task: 'Classify whether this feedback is spam.',
        feedback: {
          rating: input?.rating ?? null,
          comment,
        },
      }),
    });

    const normalizedLabel = String(aiResult?.label ?? '').trim().toLowerCase();
    const label = normalizedLabel === 'spam' ? 'spam' : 'not_spam';
    const reasons = normalizeReasonList(aiResult?.reasons, MAX_FEEDBACK_REASON_COUNT);
    const finalLabel = pickFinalFeedbackLabel({
      comment,
      label,
      isSpam: label === 'spam',
      reasons,
    });

    return {
      label,
      isSpam: label === 'spam',
      finalLabel,
      final_label: finalLabel,
      reasons,
    };
  });
}

function normalizeIssueList(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value, index) => {
      const title = normalizeText(value?.title);
      const description = normalizeText(value?.description);
      const priorityRaw = normalizeText(value?.priority).toLowerCase();
      const priority = priorityRaw === 'high' || priorityRaw === 'medium' || priorityRaw === 'low' ? priorityRaw : 'medium';

      if (!title || !description) {
        return null;
      }

      return {
        id: normalizeText(value?.id, `external-issue-${index + 1}`),
        title,
        description,
        priority,
      };
    })
    .filter(Boolean)
    .slice(0, 5);
}

function parseFactCount(report, key) {
  const facts = Array.isArray(report?.analyticsFacts) ? report.analyticsFacts : [];
  const value = facts.find((item) => String(item?.key ?? '').trim() === key)?.value;
  const matched = String(value ?? '').match(/\d+/g);
  if (!matched || matched.length === 0) {
    return 0;
  }
  return Number.parseInt(matched.join(''), 10) || 0;
}

async function summarizeReport(input = {}) {
  const base = await aiInternal.summarizeReport(input);
  const report = base?.report ?? null;
  if (!report) {
    return base;
  }

  const validFeedbackCount =
    Number.isFinite(Number(report?.feedbackStats?.validCount))
      ? Number(report.feedbackStats.validCount)
      : parseFactCount(report, 'feedback_count');
  const totalFeedbackCount =
    Number.isFinite(Number(report?.feedbackStats?.totalCount))
      ? Number(report.feedbackStats.totalCount)
      : parseFactCount(report, 'feedback_total_count');
  const hasOnlySpamOrLowSignalFeedback = totalFeedbackCount > 0 && validFeedbackCount === 0;

  const rewritten = await withExternalCache(
    'summarizeReport',
    {
      organizerId: input?.organizerId ?? null,
      activityId: input?.activityId ?? null,
      modelVersion: report?.modelVersion ?? null,
      feedbackRating: report?.feedbackRating ?? null,
      feedbackQuote: report?.feedbackQuote ?? null,
      sentimentChips: report?.sentimentChips ?? [],
      analyticsFacts: report?.analyticsFacts ?? [],
      feedbackStats: report?.feedbackStats ?? null,
      issues: report?.issues ?? [],
    },
    async () => {
      const aiResult = await callExternalJson({
        systemPrompt:
          'You write concise organizer activity report summaries. Return strict JSON only with keys: summary (string), feedbackQuote (string), issues (array of {id,title,description,priority}).',
        userPrompt: JSON.stringify({
          task: 'Rewrite report narrative for clarity while preserving factual numbers.',
          report,
        }),
      });

      return {
        summary: normalizeText(aiResult?.summary, report.summary),
        feedbackQuote: normalizeText(aiResult?.feedbackQuote, report.feedbackQuote),
        issues: normalizeIssueList(aiResult?.issues),
      };
    }
  );

  return {
    ...base,
    report: {
      ...report,
      summary: hasOnlySpamOrLowSignalFeedback ? report.summary : rewritten.summary,
      feedbackQuote: hasOnlySpamOrLowSignalFeedback
        ? 'No valid feedback available yet.'
        : rewritten.feedbackQuote,
      issues: rewritten.issues.length > 0 ? rewritten.issues : report.issues,
    },
  };
}

export { recommend, classifyFeedback, summarizeReport };
