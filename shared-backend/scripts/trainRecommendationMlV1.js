import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabaseAdmin } from '../src/database/supabase.js';
import { getActivityById } from '../src/activities/activities.service.js';
import { calculateActivityMatchForVolunteer } from '../src/recommendations/recommendations.service.js';
import {
  findOutOfCatalogInterests,
  resolveInterestCatalogSource,
  uniqueCanonicalInterests,
} from './lib/interestCatalogSource.js';

const POSITIVE_STATUSES = new Set(['approved', 'checked_in']);
const NEGATIVE_STATUSES = new Set(['rejected', 'cancelled']);
const MAX_SAMPLES = Number(process.env.RECOMMENDATION_ML_MAX_SAMPLES ?? 4000);
const EPOCHS = Number(process.env.RECOMMENDATION_ML_EPOCHS ?? 800);
const LEARNING_RATE = Number(process.env.RECOMMENDATION_ML_LR ?? 0.15);
const L2 = Number(process.env.RECOMMENDATION_ML_L2 ?? 0.001);
const MIN_TRAIN_SAMPLES_DEFAULT = 60;
const MIN_TRAIN_SAMPLES = Number(process.env.RECOMMENDATION_ML_MIN_SAMPLES ?? MIN_TRAIN_SAMPLES_DEFAULT);
const DEV_ALLOW_LOW_SAMPLE = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.RECOMMENDATION_ML_ALLOW_LOW_SAMPLE ?? '')
    .trim()
    .toLowerCase()
);
const DEV_MIN_TRAIN_SAMPLES = Number(process.env.RECOMMENDATION_ML_DEV_MIN_SAMPLES ?? 10);
const LOG_ROW_DECISIONS = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.RECOMMENDATION_ML_LOG_ROW_DECISIONS ?? '')
    .trim()
    .toLowerCase()
);
const LOG_ROW_DECISIONS_LIMIT = Number(process.env.RECOMMENDATION_ML_LOG_ROW_DECISIONS_LIMIT ?? 120);
const FEATURE_KEYS = [
  'skill_ratio',
  'interest_ratio',
  'availability_ratio',
  'experience_ratio',
  'history_ratio',
  'profile_completeness_ratio',
  'availability_coverage_ratio',
  'required_skill_density_ratio',
  'duration_fit_ratio',
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_PATH = path.resolve(__dirname, '../src/recommendations/artifacts/recommendation-ml-v1.json');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.trunc(parsed));
}

function normalizeRatio(value, maxValue) {
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isFinite(maxValue) || maxValue <= 0) {
    return 0;
  }
  return clamp(num / maxValue, 0, 1);
}

function sigmoid(z) {
  if (z >= 0) {
    const expNeg = Math.exp(-z);
    return 1 / (1 + expNeg);
  }
  const expPos = Math.exp(z);
  return expPos / (1 + expPos);
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

function resolveHistoryCutoffAt(row, activity) {
  const participationMs = parseTimestampMs(row?.created_at);
  const activityStartMs = parseTimestampMs(activity?.start_time);
  if (participationMs && activityStartMs) {
    return new Date(Math.min(participationMs, activityStartMs)).toISOString();
  }
  if (activityStartMs) {
    return new Date(activityStartMs).toISOString();
  }
  if (participationMs) {
    return new Date(participationMs).toISOString();
  }
  return new Date().toISOString();
}

function parseLabel(status) {
  const normalized = String(status ?? '').trim().toLowerCase();
  if (POSITIVE_STATUSES.has(normalized)) {
    return 1;
  }
  if (NEGATIVE_STATUSES.has(normalized)) {
    return 0;
  }
  return null;
}

function statusFromRow(row) {
  return String(row?.status ?? '')
    .trim()
    .toLowerCase();
}

function bumpCounter(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortObjectKeys(input) {
  const entries = Object.entries(input).sort((a, b) => a[0].localeCompare(b[0]));
  return Object.fromEntries(entries);
}

function formatCounterMap(map) {
  const plain = Object.fromEntries(Array.from(map.entries()));
  return sortObjectKeys(plain);
}

function buildFeatureVector(scoreBreakdown, featureSnapshot = null) {
  return {
    skill_ratio: normalizeRatio(scoreBreakdown?.skill_score, 50),
    interest_ratio: normalizeRatio(scoreBreakdown?.interest_score, 20),
    availability_ratio: normalizeRatio(scoreBreakdown?.availability_score, 15),
    experience_ratio: normalizeRatio(scoreBreakdown?.experience_score, 10),
    history_ratio: normalizeRatio(scoreBreakdown?.history_score, 5),
    profile_completeness_ratio: normalizeRatio(
      Number(
        scoreBreakdown?.profile_completeness_ratio ??
          featureSnapshot?.profile_completeness_ratio ??
          0
      ),
      1
    ),
    availability_coverage_ratio: normalizeRatio(
      Number(
        scoreBreakdown?.availability_coverage_ratio ??
          featureSnapshot?.availability_coverage_ratio ??
          0
      ),
      1
    ),
    required_skill_density_ratio: normalizeRatio(
      Number(
        scoreBreakdown?.required_skill_density_ratio ??
          featureSnapshot?.required_skill_density_ratio ??
          0
      ),
      1
    ),
    duration_fit_ratio: normalizeRatio(
      Number(
        scoreBreakdown?.duration_fit_ratio ??
          featureSnapshot?.duration_fit_ratio ??
          0
      ),
      1
    ),
  };
}

function initializeWeights() {
  return Object.fromEntries(FEATURE_KEYS.map((key) => [key, 0]));
}

function createSeededRng(seedValue) {
  let state = Math.max(1, Math.trunc(Number(seedValue) || 1337)) % 2147483647;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

function shuffleInPlace(values, rng) {
  const arr = values;
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
  return arr;
}

function createStratifiedSplit(samples, ratio = 0.8, seed = 1337) {
  const rng = createSeededRng(seed);
  const positives = shuffleInPlace(samples.filter((sample) => sample.label === 1).slice(), rng);
  const negatives = shuffleInPlace(samples.filter((sample) => sample.label === 0).slice(), rng);

  const posTrainCount = Math.floor(positives.length * ratio);
  const negTrainCount = Math.floor(negatives.length * ratio);
  const train = shuffleInPlace(
    [...positives.slice(0, posTrainCount), ...negatives.slice(0, negTrainCount)],
    rng
  );
  const test = shuffleInPlace(
    [...positives.slice(posTrainCount), ...negatives.slice(negTrainCount)],
    rng
  );

  return { train, test };
}

function trainLogisticRegression(samples) {
  let bias = 0;
  const weights = initializeWeights();
  const sampleCount = samples.length;

  for (let epoch = 0; epoch < EPOCHS; epoch += 1) {
    let gradBias = 0;
    const gradWeights = initializeWeights();

    for (const sample of samples) {
      let z = bias;
      for (const key of FEATURE_KEYS) {
        z += weights[key] * sample.features[key];
      }
      const prediction = sigmoid(z);
      const error = prediction - sample.label;
      gradBias += error;
      for (const key of FEATURE_KEYS) {
        gradWeights[key] += error * sample.features[key];
      }
    }

    const scale = 1 / sampleCount;
    bias -= LEARNING_RATE * gradBias * scale;
    for (const key of FEATURE_KEYS) {
      const regularizedGrad = gradWeights[key] * scale + L2 * weights[key];
      weights[key] -= LEARNING_RATE * regularizedGrad;
    }
  }

  return { bias, weights };
}

function evaluateModel(samples, model) {
  if (samples.length === 0) {
    return {
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1: 0,
      auc: 0,
      brier: 0,
      labelPositiveRate: 0,
      predictedPositiveRate: 0,
      confusion_matrix: {
        tp: 0,
        tn: 0,
        fp: 0,
        fn: 0,
      },
    };
  }

  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;
  const probabilityRows = [];
  for (const sample of samples) {
    let z = model.bias;
    for (const key of FEATURE_KEYS) {
      z += model.weights[key] * sample.features[key];
    }
    const probability = sigmoid(z);
    const predicted = probability >= 0.5 ? 1 : 0;
    probabilityRows.push({ probability, label: sample.label });
    if (predicted === 1 && sample.label === 1) {
      tp += 1;
    } else if (predicted === 0 && sample.label === 0) {
      tn += 1;
    } else if (predicted === 1 && sample.label === 0) {
      fp += 1;
    } else {
      fn += 1;
    }
  }

  const accuracy = (tp + tn) / samples.length;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const labelPositiveRate = (tp + fn) / samples.length;
  const predictedPositiveRate = (tp + fp) / samples.length;

  const positives = probabilityRows.filter((item) => item.label === 1).length;
  const negatives = probabilityRows.filter((item) => item.label === 0).length;
  const ranked = probabilityRows.slice().sort((left, right) => right.probability - left.probability);
  let auc = 0;
  if (positives > 0 && negatives > 0) {
    let tpRunning = 0;
    let fpRunning = 0;
    let prevTpr = 0;
    let prevFpr = 0;
    for (const row of ranked) {
      if (row.label === 1) {
        tpRunning += 1;
      } else {
        fpRunning += 1;
      }
      const tpr = tpRunning / positives;
      const fpr = fpRunning / negatives;
      auc += (fpr - prevFpr) * ((tpr + prevTpr) / 2);
      prevTpr = tpr;
      prevFpr = fpr;
    }
  }

  const brier =
    probabilityRows.reduce((sum, row) => sum + (row.probability - row.label) ** 2, 0) /
    Math.max(1, probabilityRows.length);

  return {
    accuracy: Number(accuracy.toFixed(4)),
    precision: Number(precision.toFixed(4)),
    recall: Number(recall.toFixed(4)),
    f1: Number(f1.toFixed(4)),
    auc: Number(auc.toFixed(4)),
    brier: Number(brier.toFixed(4)),
    labelPositiveRate: Number(labelPositiveRate.toFixed(4)),
    predictedPositiveRate: Number(predictedPositiveRate.toFixed(4)),
    confusion_matrix: {
      tp,
      tn,
      fp,
      fn,
    },
  };
}

function subsetByLabel(samples, label) {
  return samples.filter((sample) => sample.label === label);
}

function computeFeatureStatsForSubset(samples) {
  const stats = {};
  for (const featureKey of FEATURE_KEYS) {
    const values = samples.map((sample) => Number(sample.features?.[featureKey] ?? 0)).filter(Number.isFinite);
    if (values.length === 0) {
      stats[featureKey] = { mean: 0, std: 0, zero_rate: 1 };
      continue;
    }
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    const std = Math.sqrt(Math.max(0, variance));
    const zeroRate = values.filter((value) => value === 0).length / values.length;
    stats[featureKey] = {
      mean: Number(mean.toFixed(4)),
      std: Number(std.toFixed(4)),
      zero_rate: Number(zeroRate.toFixed(4)),
      min: Number(Math.min(...values).toFixed(4)),
      max: Number(Math.max(...values).toFixed(4)),
    };
  }
  return stats;
}

function computeFeatureStats(samples) {
  return {
    overall: computeFeatureStatsForSubset(samples),
    positive: computeFeatureStatsForSubset(subsetByLabel(samples, 1)),
    negative: computeFeatureStatsForSubset(subsetByLabel(samples, 0)),
  };
}

async function collectTrainingSamples() {
  const fetchLimit = safePositiveInt(MAX_SAMPLES * 2, 8000);
  const { data, error } = await supabaseAdmin
    .from('activity_participations')
    .select('id, activity_id, volunteer_id, status, created_at')
    .order('created_at', { ascending: false })
    .limit(fetchLimit);

  if (error) {
    throw new Error(error.message);
  }

  const stats = {
    source_table: 'activity_participations',
    fetched_rows: Array.isArray(data) ? data.length : 0,
    fetch_limit: fetchLimit,
    max_labeled_samples: safePositiveInt(MAX_SAMPLES, 4000),
    label_mapping: {
      positive: Array.from(POSITIVE_STATUSES),
      negative: Array.from(NEGATIVE_STATUSES),
      ignored: 'all other statuses',
    },
    row_decision_counts: {
      accepted: 0,
      skipped_unlabeled_status: 0,
      skipped_missing_activity_id: 0,
      skipped_missing_volunteer_id: 0,
      skipped_missing_activity_record: 0,
      skipped_scoring_error: 0,
    },
    label_distribution: {
      accepted_positive: 0,
      accepted_negative: 0,
    },
    status_histogram_fetched: new Map(),
    status_histogram_accepted: new Map(),
  };

  const activityCache = new Map();
  const samples = [];
  let rowDecisionLogCount = 0;
  for (const row of data ?? []) {
    if (samples.length >= stats.max_labeled_samples) {
      break;
    }

    const normalizedStatus = statusFromRow(row);
    bumpCounter(stats.status_histogram_fetched, normalizedStatus || '(empty)');

    const label = parseLabel(row.status);
    if (label == null) {
      stats.row_decision_counts.skipped_unlabeled_status += 1;
      if (LOG_ROW_DECISIONS && rowDecisionLogCount < LOG_ROW_DECISIONS_LIMIT) {
        console.log(
          `[trainRecommendationMlV1] skip row ${row.id}: unlabeled status="${normalizedStatus || '(empty)'}"`
        );
        rowDecisionLogCount += 1;
      }
      continue;
    }

    if (!row.activity_id) {
      stats.row_decision_counts.skipped_missing_activity_id += 1;
      if (LOG_ROW_DECISIONS && rowDecisionLogCount < LOG_ROW_DECISIONS_LIMIT) {
        console.log(`[trainRecommendationMlV1] skip row ${row.id}: missing activity_id`);
        rowDecisionLogCount += 1;
      }
      continue;
    }

    if (!row.volunteer_id) {
      stats.row_decision_counts.skipped_missing_volunteer_id += 1;
      if (LOG_ROW_DECISIONS && rowDecisionLogCount < LOG_ROW_DECISIONS_LIMIT) {
        console.log(`[trainRecommendationMlV1] skip row ${row.id}: missing volunteer_id`);
        rowDecisionLogCount += 1;
      }
      continue;
    }

    let activity = activityCache.get(row.activity_id);
    if (!activity) {
      activity = await getActivityById(row.activity_id);
      if (!activity) {
        stats.row_decision_counts.skipped_missing_activity_record += 1;
        if (LOG_ROW_DECISIONS && rowDecisionLogCount < LOG_ROW_DECISIONS_LIMIT) {
          console.log(`[trainRecommendationMlV1] skip row ${row.id}: activity not found (${row.activity_id})`);
          rowDecisionLogCount += 1;
        }
        continue;
      }
      activityCache.set(row.activity_id, activity);
    }

    let scored;
    try {
      const historyCutoffAt = resolveHistoryCutoffAt(row, activity);
      scored = await calculateActivityMatchForVolunteer({
        activity,
        volunteerId: row.volunteer_id,
        historyCutoffAt,
        excludeActivityId: row.activity_id,
      });
    } catch (scoreError) {
      stats.row_decision_counts.skipped_scoring_error += 1;
      if (LOG_ROW_DECISIONS && rowDecisionLogCount < LOG_ROW_DECISIONS_LIMIT) {
        const scoreMessage = scoreError instanceof Error ? scoreError.message : String(scoreError);
        console.log(`[trainRecommendationMlV1] skip row ${row.id}: scoring error (${scoreMessage})`);
        rowDecisionLogCount += 1;
      }
      continue;
    }

    const features = buildFeatureVector(scored?.score_breakdown ?? null, scored?.feature_snapshot ?? null);
    stats.row_decision_counts.accepted += 1;
    if (label === 1) {
      stats.label_distribution.accepted_positive += 1;
    } else {
      stats.label_distribution.accepted_negative += 1;
    }
    bumpCounter(stats.status_histogram_accepted, normalizedStatus || '(empty)');

    if (LOG_ROW_DECISIONS && rowDecisionLogCount < LOG_ROW_DECISIONS_LIMIT) {
      console.log(
        `[trainRecommendationMlV1] accept row ${row.id}: status=${normalizedStatus}, label=${label}, features=${JSON.stringify(features)}`
      );
      rowDecisionLogCount += 1;
    }

    samples.push({
      label,
      features,
      source_participation_id: row.id,
      source_status: normalizedStatus,
    });
  }

  const summary = {
    ...stats,
    status_histogram_fetched: formatCounterMap(stats.status_histogram_fetched),
    status_histogram_accepted: formatCounterMap(stats.status_histogram_accepted),
  };

  return { samples, summary };
}

async function runInterestCatalogPreflight() {
  const catalogSource = await resolveInterestCatalogSource(supabaseAdmin, { preferDbWhenAvailable: true });
  if (catalogSource.fe_db_mismatch.has_mismatch) {
    throw new Error(
      `Interest catalog mismatch between FE and DB. ` +
        `only_in_fe=${catalogSource.fe_db_mismatch.only_in_fe.join('|') || '(none)'}, ` +
        `only_in_db=${catalogSource.fe_db_mismatch.only_in_db.join('|') || '(none)'}`
    );
  }

  const { data: profiles, error } = await supabaseAdmin
    .from('volunteer_profiles')
    .select('user_id, interests')
    .limit(10000);
  if (error) {
    throw new Error(error.message);
  }

  const outOfCatalogByUser = new Map();
  for (const profile of profiles ?? []) {
    const interests = Array.isArray(profile?.interests) ? profile.interests : [];
    const outOfCatalog = findOutOfCatalogInterests(interests, catalogSource.selected_catalog);
    if (outOfCatalog.length > 0) {
      outOfCatalogByUser.set(String(profile?.user_id ?? ''), outOfCatalog);
    }
  }

  return {
    catalogSource,
    out_of_catalog_profile_count: outOfCatalogByUser.size,
    out_of_catalog_interests: uniqueCanonicalInterests(
      Array.from(outOfCatalogByUser.values()).flatMap((values) => values)
    ),
  };
}

async function main() {
  const interestPreflight = await runInterestCatalogPreflight();
  const minTrainSamples = safePositiveInt(MIN_TRAIN_SAMPLES, MIN_TRAIN_SAMPLES_DEFAULT);
  const devMinTrainSamples = safePositiveInt(DEV_MIN_TRAIN_SAMPLES, 10);
  const { samples, summary } = await collectTrainingSamples();

  console.log(
    `[trainRecommendationMlV1] interest_source=${interestPreflight.catalogSource.selected_source}, ` +
      `interest_count=${interestPreflight.catalogSource.selected_count}, ` +
      `interest_sample=${interestPreflight.catalogSource.selected_catalog.slice(0, 8).join('|')}`
  );
  console.log(
    `[trainRecommendationMlV1] profile_out_of_catalog_interests_count=${interestPreflight.out_of_catalog_interests.length}, ` +
      `profile_out_of_catalog_profiles_count=${interestPreflight.out_of_catalog_profile_count}`
  );
  if (interestPreflight.out_of_catalog_interests.length > 0) {
    console.warn(
      `[trainRecommendationMlV1] warning: legacy interests outside selected catalog: ${interestPreflight.out_of_catalog_interests
        .slice(0, 20)
        .join(', ')}`
    );
  }

  console.log(
    `[trainRecommendationMlV1] source=${summary.source_table}, fetched_rows=${summary.fetched_rows}, max_labeled_samples=${summary.max_labeled_samples}`
  );
  console.log(`[trainRecommendationMlV1] label_mapping=${JSON.stringify(summary.label_mapping)}`);
  console.log(
    `[trainRecommendationMlV1] row_decision_counts=${JSON.stringify(summary.row_decision_counts)}`
  );
  console.log(
    `[trainRecommendationMlV1] accepted_label_distribution=${JSON.stringify(summary.label_distribution)}`
  );
  console.log(
    `[trainRecommendationMlV1] status_histogram_fetched=${JSON.stringify(summary.status_histogram_fetched)}`
  );
  console.log(
    `[trainRecommendationMlV1] status_histogram_accepted=${JSON.stringify(summary.status_histogram_accepted)}`
  );

  if (samples.length < minTrainSamples) {
    const message =
      `Not enough labeled samples for default threshold (need >= ${minTrainSamples}, got ${samples.length}).` +
      ` Set RECOMMENDATION_ML_MIN_SAMPLES or enable RECOMMENDATION_ML_ALLOW_LOW_SAMPLE=true for dev/demo mode.`;

    if (!DEV_ALLOW_LOW_SAMPLE) {
      throw new Error(message);
    }

    if (samples.length < devMinTrainSamples) {
      throw new Error(
        `${message} Low-sample mode is enabled, but still below RECOMMENDATION_ML_DEV_MIN_SAMPLES=${devMinTrainSamples}.`
      );
    }

    console.warn(
      `[trainRecommendationMlV1] warning: training in low-sample mode ` +
        `(samples=${samples.length}, default_min=${minTrainSamples}, dev_min=${devMinTrainSamples}).`
    );
  }

  const splitSeed = safePositiveInt(process.env.RECOMMENDATION_ML_SPLIT_SEED ?? 1337, 1337);
  const { train, test } = createStratifiedSplit(samples, 0.8, splitSeed);
  const model = trainLogisticRegression(train);
  const trainMetrics = evaluateModel(train, model);
  const testMetrics = evaluateModel(test, model);
  const featureStats = computeFeatureStats(samples);
  const positiveCount = samples.filter((sample) => sample.label === 1).length;
  const negativeCount = samples.length - positiveCount;
  const roundedWeights = Object.fromEntries(
    FEATURE_KEYS.map((key) => [key, Number(model.weights[key].toFixed(8))])
  );
  const historyWeightAbs = Math.abs(Number(roundedWeights.history_ratio ?? 0));
  const coreWeightAbsMax = Math.max(
    1e-6,
    Math.abs(Number(roundedWeights.skill_ratio ?? 0)),
    Math.abs(Number(roundedWeights.interest_ratio ?? 0)),
    Math.abs(Number(roundedWeights.availability_ratio ?? 0))
  );
  const historyDominanceRatio = historyWeightAbs / coreWeightAbsMax;

  const artifact = {
    model_version: `ml-v1-logreg-${new Date().toISOString().slice(0, 10)}`,
    provider: 'internal',
    label: 'approved_or_checked_in',
    trained_at: new Date().toISOString(),
    sample_size: samples.length,
    dataset_summary: {
      sample_size: samples.length,
      positive_count: positiveCount,
      negative_count: negativeCount,
      positive_rate: Number((positiveCount / Math.max(1, samples.length)).toFixed(4)),
      split: {
        train_size: train.length,
        test_size: test.length,
        train_ratio: Number((train.length / Math.max(1, samples.length)).toFixed(4)),
        test_ratio: Number((test.length / Math.max(1, samples.length)).toFixed(4)),
      },
      source_summary: summary,
    },
    label_distribution: {
      positive: positiveCount,
      negative: negativeCount,
      positive_rate: Number((positiveCount / Math.max(1, samples.length)).toFixed(4)),
      negative_rate: Number((negativeCount / Math.max(1, samples.length)).toFixed(4)),
    },
    training_config: {
      max_samples: MAX_SAMPLES,
      min_train_samples: minTrainSamples,
      dev_allow_low_sample: DEV_ALLOW_LOW_SAMPLE,
      dev_min_train_samples: devMinTrainSamples,
      epochs: EPOCHS,
      learning_rate: LEARNING_RATE,
      l2: L2,
      feature_keys: FEATURE_KEYS,
      low_sample_mode_used: samples.length < minTrainSamples,
      interest_catalog_source: interestPreflight.catalogSource.selected_source,
      split_seed: splitSeed,
      split_strategy: 'stratified_shuffle_80_20',
    },
    feature_schema: FEATURE_KEYS.map((featureKey) => ({
      key: featureKey,
      min: 0,
      max: 1,
      type: 'ratio',
    })),
    interest_catalog: {
      selected_source: interestPreflight.catalogSource.selected_source,
      selected_count: interestPreflight.catalogSource.selected_count,
      sample_interests: interestPreflight.catalogSource.selected_catalog.slice(0, 12),
      fe_db_mismatch: {
        has_mismatch: interestPreflight.catalogSource.fe_db_mismatch.has_mismatch,
        only_in_fe_count: interestPreflight.catalogSource.fe_db_mismatch.only_in_fe.length,
        only_in_db_count: interestPreflight.catalogSource.fe_db_mismatch.only_in_db.length,
      },
      profile_out_of_catalog_profiles_count: interestPreflight.out_of_catalog_profile_count,
      profile_out_of_catalog_interests_count: interestPreflight.out_of_catalog_interests.length,
      profile_out_of_catalog_interests_preview: interestPreflight.out_of_catalog_interests.slice(0, 20),
    },
    metrics: {
      train: trainMetrics,
      test: testMetrics,
    },
    feature_stats: featureStats,
    weight_sanity: {
      history_dominance_ratio: Number(historyDominanceRatio.toFixed(4)),
      has_negative_skill_weight: Number(roundedWeights.skill_ratio ?? 0) < -0.1,
      has_zero_interest_weight:
        Number(roundedWeights.interest_ratio ?? 0) === 0 &&
        Number(featureStats?.overall?.interest_ratio?.mean ?? 0) > 0,
    },
    bias: Number(model.bias.toFixed(8)),
    weights: roundedWeights,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

  console.log(`[trainRecommendationMlV1] wrote artifact: ${OUTPUT_PATH}`);
  console.log(
    `[trainRecommendationMlV1] sample_size=${artifact.sample_size}, train_size=${train.length}, test_size=${test.length}, ` +
      `train_acc=${artifact.metrics.train.accuracy}, test_acc=${artifact.metrics.test.accuracy}, ` +
      `low_sample_mode_used=${artifact.training_config.low_sample_mode_used}`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[trainRecommendationMlV1] failed: ${message}`);
  process.exitCode = 1;
});
