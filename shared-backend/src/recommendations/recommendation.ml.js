import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const FEATURE_KEYS = ['skill_ratio', 'interest_ratio', 'availability_ratio', 'experience_ratio', 'history_ratio'];
const DEFAULT_MODEL_VERSION = 'heuristic-v2-lite-2026-04';
const DEFAULT_MODEL_PROVIDER = 'internal';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_MODEL_PATH = path.resolve(__dirname, 'artifacts', 'recommendation-ml-v1.json');
const MODEL_PATH = String(process.env.RECOMMENDATION_ML_MODEL_PATH ?? '').trim() || DEFAULT_MODEL_PATH;
const RUNTIME_MIN_SAMPLES = Math.max(
  1,
  Math.trunc(
    safeNumber(
      process.env.RECOMMENDATION_ML_RUNTIME_MIN_SAMPLES ?? process.env.RECOMMENDATION_ML_MIN_SAMPLES ?? 60,
      60
    )
  )
);
const FORCE_HEURISTIC = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.RECOMMENDATION_ML_FORCE_HEURISTIC ?? '')
    .trim()
    .toLowerCase()
);

let cachedModel = null;
let cachedModelReady = false;
let cachedModelUnavailableReason = 'not_loaded';

function safeNumber(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return num;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sigmoid(z) {
  if (z >= 0) {
    const expNeg = Math.exp(-z);
    return 1 / (1 + expNeg);
  }
  const expPos = Math.exp(z);
  return expPos / (1 + expPos);
}

function normalizeRatio(value, maxValue) {
  if (!Number.isFinite(value) || !Number.isFinite(maxValue) || maxValue <= 0) {
    return 0;
  }
  return clamp(value / maxValue, 0, 1);
}

function sanitizeModel(rawModel) {
  if (!rawModel || typeof rawModel !== 'object') {
    return null;
  }

  const weightsRaw = rawModel.weights && typeof rawModel.weights === 'object' ? rawModel.weights : null;
  if (!weightsRaw) {
    return null;
  }

  const weights = {};
  for (const featureKey of FEATURE_KEYS) {
    const numericWeight = safeNumber(weightsRaw[featureKey], NaN);
    if (!Number.isFinite(numericWeight)) {
      return null;
    }
    weights[featureKey] = numericWeight;
  }

  const bias = safeNumber(rawModel.bias, NaN);
  if (!Number.isFinite(bias)) {
    return null;
  }

  const version = String(rawModel.model_version ?? '').trim();
  if (!version) {
    return null;
  }

  return {
    model_version: version,
    provider: String(rawModel.provider ?? DEFAULT_MODEL_PROVIDER).trim() || DEFAULT_MODEL_PROVIDER,
    label: String(rawModel.label ?? 'approved_or_checked_in').trim() || 'approved_or_checked_in',
    weights,
    bias,
    sample_size: safeNumber(rawModel.sample_size, 0),
    training_config:
      rawModel.training_config && typeof rawModel.training_config === 'object' ? rawModel.training_config : null,
  };
}

function getModelRejectionReason(model) {
  if (!model) {
    return 'model_invalid_shape';
  }

  const sampleSize = safeNumber(model.sample_size, 0);
  if (sampleSize <= 0) {
    return 'artifact_missing_sample_size';
  }
  if (sampleSize > 0 && sampleSize < RUNTIME_MIN_SAMPLES) {
    return `artifact_sample_size_below_threshold(${sampleSize}<${RUNTIME_MIN_SAMPLES})`;
  }

  const configMinSamples = safeNumber(model?.training_config?.min_train_samples, NaN);
  if (Number.isFinite(configMinSamples) && configMinSamples < RUNTIME_MIN_SAMPLES) {
    return `artifact_min_train_samples_below_threshold(${configMinSamples}<${RUNTIME_MIN_SAMPLES})`;
  }

  const lowSampleModeUsed = Boolean(model?.training_config?.low_sample_mode_used);
  if (lowSampleModeUsed && RUNTIME_MIN_SAMPLES >= 60) {
    return 'artifact_trained_in_low_sample_mode';
  }

  return null;
}

function tryLoadModel() {
  if (FORCE_HEURISTIC) {
    if (!cachedModelReady) {
      console.warn('[recommendation.ml] RECOMMENDATION_ML_FORCE_HEURISTIC=true, skip ML model load');
      cachedModelReady = true;
      cachedModel = null;
      cachedModelUnavailableReason = 'force_heuristic_env';
    }
    return null;
  }

  if (cachedModelReady) {
    return cachedModel;
  }
  cachedModelReady = true;

  try {
    const text = fs.readFileSync(MODEL_PATH, 'utf8');
    const parsed = JSON.parse(text);
    const sanitized = sanitizeModel(parsed);
    const rejectionReason = getModelRejectionReason(sanitized);
    if (rejectionReason) {
      cachedModel = null;
      cachedModelUnavailableReason = rejectionReason;
      console.warn(`[recommendation.ml] model rejected, fallback to heuristic: ${rejectionReason}`);
      return cachedModel;
    }
    cachedModel = sanitized;
    cachedModelUnavailableReason = null;
    if (!cachedModel) {
      cachedModelUnavailableReason = 'model_invalid_shape';
      console.error('[recommendation.ml] model file invalid shape, fallback to heuristic');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[recommendation.ml] model unavailable (${MODEL_PATH}), fallback to heuristic: ${message}`);
    cachedModel = null;
    cachedModelUnavailableReason = `artifact_load_error:${message.slice(0, 120)}`;
  }

  return cachedModel;
}

function resetModelCacheForTests() {
  cachedModel = null;
  cachedModelReady = false;
  cachedModelUnavailableReason = 'not_loaded';
}

function buildMlFeatures(scoreBreakdown = {}) {
  return {
    skill_ratio: normalizeRatio(safeNumber(scoreBreakdown.skill_score, 0), 50),
    interest_ratio: normalizeRatio(safeNumber(scoreBreakdown.interest_score, 0), 20),
    availability_ratio: normalizeRatio(safeNumber(scoreBreakdown.availability_score, 0), 15),
    experience_ratio: normalizeRatio(safeNumber(scoreBreakdown.experience_score, 0), 10),
    history_ratio: normalizeRatio(safeNumber(scoreBreakdown.history_score, 0), 5),
  };
}

function getReasonCodesFromContributions(features, termContributions) {
  const codeByFeature = {
    skill_ratio: 'skills_partial_match',
    interest_ratio: 'interest_overlap',
    availability_ratio: 'availability_overlap',
    experience_ratio: 'experience_signal',
    history_ratio: 'organizer_history_signal',
  };

  const positiveTerms = termContributions.filter((item) => safeNumber(item.raw, 0) > 0);
  const totalPositive = positiveTerms.reduce((sum, item) => sum + safeNumber(item.raw, 0), 0);
  const minAbsoluteContribution = 0.02;
  const minRelativeShare = 0.08;

  const selected = [];
  for (const item of positiveTerms) {
    const code = codeByFeature[item.feature];
    if (!code) {
      continue;
    }
    const signalRatio = safeNumber(features[item.feature], 0);
    if (signalRatio <= 0) {
      continue;
    }
    const absolute = safeNumber(item.raw, 0);
    const relative = totalPositive > 0 ? absolute / totalPositive : 0;
    if (absolute < minAbsoluteContribution && relative < minRelativeShare) {
      continue;
    }
    selected.push({ code, absolute });
  }

  selected.sort((left, right) => right.absolute - left.absolute);
  const reasonCodes = [];
  for (const item of selected) {
    reasonCodes.push(item.code);
  }

  if (reasonCodes.includes('skills_partial_match') && features.skill_ratio >= 0.95) {
    const idx = reasonCodes.indexOf('skills_partial_match');
    reasonCodes[idx] = 'skills_full_match';
  }

  return reasonCodes;
}

function scoreWithMlModel(heuristicResult = {}) {
  const heuristicScore = clamp(
    safeNumber(heuristicResult?.matchScore, safeNumber(heuristicResult?.score_breakdown?.final_score, 0)),
    0,
    100
  );
  const model = tryLoadModel();
  if (!model) {
    return {
      ...heuristicResult,
      model_version: String(heuristicResult?.model_version ?? DEFAULT_MODEL_VERSION).trim() || DEFAULT_MODEL_VERSION,
      provider: String(heuristicResult?.provider ?? DEFAULT_MODEL_PROVIDER).trim() || DEFAULT_MODEL_PROVIDER,
      model_kind: 'heuristic',
      prediction_snapshot: {
        strategy: FORCE_HEURISTIC ? 'heuristic_forced' : 'heuristic_fallback',
        fallback_reason: FORCE_HEURISTIC
          ? 'force_heuristic_env'
          : cachedModelUnavailableReason || 'model_unavailable_or_invalid',
        heuristic_score: heuristicScore,
        ml_score: null,
        final_score: heuristicScore,
      },
      feature_snapshot: {
        ...(heuristicResult?.feature_snapshot && typeof heuristicResult.feature_snapshot === 'object'
          ? heuristicResult.feature_snapshot
          : {}),
        ...buildMlFeatures(heuristicResult?.score_breakdown),
      },
    };
  }

  const features = buildMlFeatures(heuristicResult?.score_breakdown);
  let logit = model.bias;
  for (const featureKey of FEATURE_KEYS) {
    logit += safeNumber(model.weights[featureKey], 0) * safeNumber(features[featureKey], 0);
  }

  const probability = sigmoid(logit);
  const matchScore = clamp(Number((probability * 100).toFixed(1)), 0, 100);

  const termContributions = FEATURE_KEYS.map((featureKey) => ({
    feature: featureKey,
    raw: safeNumber(model.weights[featureKey], 0) * safeNumber(features[featureKey], 0),
  }));
  const reasonCodes = getReasonCodesFromContributions(features, termContributions);
  const maxAbsTerm = Math.max(
    1e-6,
    ...termContributions.map((item) => Math.abs(item.raw)),
  );
  const positiveTermTotal = termContributions
    .map((item) => Math.max(0, safeNumber(item.raw, 0)))
    .reduce((sum, value) => sum + value, 0);

  const featureContributions = termContributions.map((item) => {
    const label = item.feature.replace('_ratio', '');
    const normalizedMagnitude = Math.round((Math.abs(item.raw) / maxAbsTerm) * 100);
    const weightedShare = positiveTermTotal > 0 ? Math.max(0, item.raw) / positiveTermTotal : 0;
    return {
      feature: label,
      score: normalizedMagnitude,
      max_score: 100,
      raw_contribution: Number(item.raw.toFixed(6)),
      weighted_share: Number(weightedShare.toFixed(4)),
      signal_ratio: Number(safeNumber(features[item.feature], 0).toFixed(3)),
      detail: `${label} signal=${features[item.feature].toFixed(3)}, weight=${safeNumber(model.weights[item.feature], 0).toFixed(3)}`,
    };
  });

  const explanation =
    `Predicted participation success probability ${(probability * 100).toFixed(1)}% from structured profile/activity features.` +
    ` Dominant signals come from weighted overlap + availability/experience history.`;

  return {
    ...heuristicResult,
    matchScore,
    matchRatio: Number((matchScore / 100).toFixed(3)),
    reason_codes: reasonCodes,
    feature_contributions: featureContributions,
    score_breakdown: {
      ...(heuristicResult?.score_breakdown ?? {}),
      final_score: matchScore,
    },
    model_version: model.model_version,
    provider: model.provider || DEFAULT_MODEL_PROVIDER,
    model_kind: 'ml_logistic_regression_v1',
    explanation,
    feature_snapshot: {
      ...(heuristicResult?.feature_snapshot && typeof heuristicResult.feature_snapshot === 'object'
        ? heuristicResult.feature_snapshot
        : {}),
      ...features,
    },
    prediction_snapshot: {
      strategy: 'ml_logistic_regression',
      label: model.label,
      probability,
      logit,
      heuristic_score: heuristicScore,
      ml_score: matchScore,
      final_score: matchScore,
      weights: model.weights,
      bias: model.bias,
    },
  };
}

export { scoreWithMlModel, resetModelCacheForTests, tryLoadModel };
