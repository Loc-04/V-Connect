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
      return await aiExternal[method](input);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[ai.router] external ${feature} failed (provider=${AI_EXTERNAL_PROVIDER}), fallback to internal: ${message}`
      );
      return aiInternal[method](input);
    }
  }

  return aiInternal[method](input);
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
