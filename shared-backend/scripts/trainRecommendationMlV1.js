import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabaseAdmin } from '../src/database/supabase.js';
import { getActivityById } from '../src/activities/activities.service.js';
import { calculateActivityMatchForVolunteer } from '../src/recommendations/recommendations.service.js';

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
const FEATURE_KEYS = ['skill_ratio', 'interest_ratio', 'availability_ratio', 'experience_ratio', 'history_ratio'];

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

function buildFeatureVector(scoreBreakdown) {
  return {
    skill_ratio: normalizeRatio(scoreBreakdown?.skill_score, 50),
    interest_ratio: normalizeRatio(scoreBreakdown?.interest_score, 20),
    availability_ratio: normalizeRatio(scoreBreakdown?.availability_score, 15),
    experience_ratio: normalizeRatio(scoreBreakdown?.experience_score, 10),
    history_ratio: normalizeRatio(scoreBreakdown?.history_score, 5),
  };
}

function initializeWeights() {
  return {
    skill_ratio: 0,
    interest_ratio: 0,
    availability_ratio: 0,
    experience_ratio: 0,
    history_ratio: 0,
  };
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
    return { accuracy: 0, positiveRate: 0 };
  }

  let correct = 0;
  let positivePredictions = 0;
  for (const sample of samples) {
    let z = model.bias;
    for (const key of FEATURE_KEYS) {
      z += model.weights[key] * sample.features[key];
    }
    const probability = sigmoid(z);
    const predicted = probability >= 0.5 ? 1 : 0;
    if (predicted === sample.label) {
      correct += 1;
    }
    if (predicted === 1) {
      positivePredictions += 1;
    }
  }

  return {
    accuracy: Number((correct / samples.length).toFixed(4)),
    positiveRate: Number((positivePredictions / samples.length).toFixed(4)),
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
      scored = await calculateActivityMatchForVolunteer({
        activity,
        volunteerId: row.volunteer_id,
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

    const features = buildFeatureVector(scored?.score_breakdown ?? null);
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

async function main() {
  const minTrainSamples = safePositiveInt(MIN_TRAIN_SAMPLES, MIN_TRAIN_SAMPLES_DEFAULT);
  const devMinTrainSamples = safePositiveInt(DEV_MIN_TRAIN_SAMPLES, 10);
  const { samples, summary } = await collectTrainingSamples();

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

  const splitIndex = Math.floor(samples.length * 0.8);
  const train = samples.slice(0, splitIndex);
  const test = samples.slice(splitIndex);
  const model = trainLogisticRegression(train);
  const trainMetrics = evaluateModel(train, model);
  const testMetrics = evaluateModel(test, model);

  const artifact = {
    model_version: `ml-v1-logreg-${new Date().toISOString().slice(0, 10)}`,
    provider: 'internal',
    label: 'approved_or_checked_in',
    trained_at: new Date().toISOString(),
    sample_size: samples.length,
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
    },
    metrics: {
      train: trainMetrics,
      test: testMetrics,
    },
    bias: Number(model.bias.toFixed(8)),
    weights: Object.fromEntries(
      FEATURE_KEYS.map((key) => [key, Number(model.weights[key].toFixed(8))])
    ),
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
