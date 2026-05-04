import {
  AI_EXTERNAL_PROVIDER,
  AI_PROVIDER_CLASSIFY,
  AI_PROVIDER_RECOMMEND,
  AI_PROVIDER_SUMMARIZE,
} from '../config/env.js';
import * as aiExternal from './ai.external.js';
import * as aiInternal from './ai.internal.js';

const SHOULD_LOG_PROVIDER =
  String(process.env.AI_DEBUG_PROVIDER ?? '').trim().toLowerCase() === 'true' &&
  String(process.env.NODE_ENV ?? '').trim().toLowerCase() !== 'production';

function normalizeFallbackReason(error) {
  const message = error instanceof Error ? error.message : String(error ?? 'external_error');
  return message.trim().slice(0, 240) || 'external_error';
}

function attachAiMeta(result, aiMeta) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return {
      data: result ?? null,
      ai_meta: aiMeta,
    };
  }

  const existing = result.ai_meta && typeof result.ai_meta === 'object' ? result.ai_meta : {};
  return {
    ...result,
    ai_meta: {
      ...existing,
      ...aiMeta,
    },
  };
}

function getConfiguredProvider(feature) {
  if (feature === 'recommend') {
    return AI_PROVIDER_RECOMMEND === 'external' ? 'external' : 'internal';
  }
  if (feature === 'classify') {
    return AI_PROVIDER_CLASSIFY === 'external' ? 'external' : 'internal';
  }
  if (feature === 'summarize') {
    return AI_PROVIDER_SUMMARIZE === 'external' ? 'external' : 'internal';
  }
  return 'internal';
}

function getFeatureMethod(feature) {
  if (feature === 'recommend') {
    return 'recommend';
  }
  if (feature === 'classify') {
    return 'classifyFeedback';
  }
  return 'summarizeReport';
}

async function executeFeature(feature, input) {
  const method = getFeatureMethod(feature);
  const provider = getConfiguredProvider(feature);

  if (SHOULD_LOG_PROVIDER) {
    console.info(`[AI] ${feature} -> ${provider}`);
  }

  if (provider === 'external') {
    try {
      const output = await aiExternal[method](input);
      const existingMeta =
        output?.ai_meta && typeof output.ai_meta === 'object' ? output.ai_meta : {};
      return attachAiMeta(output, {
        feature,
        provider: existingMeta.provider ?? 'external',
        external_provider: existingMeta.external_provider ?? AI_EXTERNAL_PROVIDER,
        model: existingMeta.model ?? null,
        fallback_used:
          typeof existingMeta.fallback_used === 'boolean' ? existingMeta.fallback_used : false,
        fallback_reason: existingMeta.fallback_reason ?? null,
      });
    } catch (error) {
      const fallbackReason = normalizeFallbackReason(error);
      console.error(
        `[ai.router] feature=${feature} provider=${AI_EXTERNAL_PROVIDER} fallback_used=true reason="${fallbackReason}"`
      );
      const output = await aiInternal[method](input);
      return attachAiMeta(output, {
        feature,
        provider: 'internal',
        external_provider: AI_EXTERNAL_PROVIDER,
        fallback_used: true,
        fallback_reason: fallbackReason,
      });
    }
  }

  const output = await aiInternal[method](input);
  return attachAiMeta(output, {
    feature,
    provider: 'internal',
    external_provider: null,
    fallback_used: false,
    fallback_reason: null,
  });
}

async function recommend(input) {
  return executeFeature('recommend', input);
}

async function classifyFeedback(input) {
  return executeFeature('classify', input);
}

async function summarizeReport(input) {
  return executeFeature('summarize', input);
}

export { recommend, classifyFeedback, summarizeReport };
