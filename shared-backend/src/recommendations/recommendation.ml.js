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

let cachedModel = null;
let cachedModelReady = false;

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
  };
}

function tryLoadModel() {
  if (cachedModelReady) {
    return cachedModel;
  }
  cachedModelReady = true;

  try {
    const text = fs.readFileSync(MODEL_PATH, 'utf8');
    const parsed = JSON.parse(text);
    cachedModel = sanitizeModel(parsed);
    if (!cachedModel) {
      console.error('[recommendation.ml] model file invalid shape, fallback to heuristic');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[recommendation.ml] model unavailable (${MODEL_PATH}), fallback to heuristic: ${message}`);
    cachedModel = null;
  }

  return cachedModel;
}

function resetModelCacheForTests() {
  cachedModel = null;
  cachedModelReady = false;
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

function getReasonCodesFromFeatures(features) {
  const reasonCodes = [];
  if (features.skill_ratio >= 0.8) {
    reasonCodes.push('skills_full_match');
  } else if (features.skill_ratio > 0.2) {
    reasonCodes.push('skills_partial_match');
  }

  if (features.interest_ratio > 0.2) {
    reasonCodes.push('interest_overlap');
  }
  if (features.availability_ratio > 0) {
    reasonCodes.push('availability_overlap');
  }
  if (features.experience_ratio > 0) {
    reasonCodes.push('experience_signal');
  }
  if (features.history_ratio > 0) {
    reasonCodes.push('organizer_history_signal');
  }
  return reasonCodes;
}

function scoreWithMlModel(heuristicResult = {}) {
  const model = tryLoadModel();
  if (!model) {
    return {
      ...heuristicResult,
      model_version: String(heuristicResult?.model_version ?? DEFAULT_MODEL_VERSION).trim() || DEFAULT_MODEL_VERSION,
      provider: String(heuristicResult?.provider ?? DEFAULT_MODEL_PROVIDER).trim() || DEFAULT_MODEL_PROVIDER,
      model_kind: 'heuristic',
      prediction_snapshot: {
        strategy: 'heuristic_fallback',
      },
      feature_snapshot: {
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
  const matchScore = clamp(Math.round(probability * 100), 0, 100);
  const reasonCodes = getReasonCodesFromFeatures(features);

  const termContributions = FEATURE_KEYS.map((featureKey) => ({
    feature: featureKey,
    raw: safeNumber(model.weights[featureKey], 0) * safeNumber(features[featureKey], 0),
  }));
  const maxAbsTerm = Math.max(
    1e-6,
    ...termContributions.map((item) => Math.abs(item.raw)),
  );

  const featureContributions = termContributions.map((item) => {
    const label = item.feature.replace('_ratio', '');
    const normalizedMagnitude = Math.round((Math.abs(item.raw) / maxAbsTerm) * 100);
    return {
      feature: label,
      score: normalizedMagnitude,
      max_score: 100,
      detail: `${label} signal=${features[item.feature].toFixed(3)}, weight=${safeNumber(model.weights[item.feature], 0).toFixed(3)}`,
    };
  });

  const explanation =
    `Predicted participation success probability ${(probability * 100).toFixed(1)}% from structured profile/activity features.` +
    ` Dominant signals come from weighted overlap + availability/experience history.`;

  return {
    ...heuristicResult,
    matchScore,
    matchRatio: Number((matchScore / 100).toFixed(2)),
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
    feature_snapshot: features,
    prediction_snapshot: {
      label: model.label,
      probability,
      logit,
      weights: model.weights,
      bias: model.bias,
    },
  };
}

export { scoreWithMlModel, resetModelCacheForTests, tryLoadModel };
