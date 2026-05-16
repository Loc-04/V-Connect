import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { supabaseAdmin } from '../src/database/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_PATH = path.resolve(__dirname, '../src/recommendations/artifacts/recommendation-ml-v1.json');
const EVALUATION_OUTPUT_PATH = path.resolve(
  __dirname,
  '../src/recommendations/artifacts/recommendation-ml-v1-evaluation.json'
);
const MAX_SEED_USERS = Math.max(0, Math.trunc(Number(process.env.RECOMMENDATION_ML_EVAL_SEED_USERS ?? 5)));
const DEFAULT_BLEND_SCENARIOS = [0.25, 0.4, 0.6];

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function parseBlendWeights(rawValue) {
  const text = String(rawValue ?? '')
    .trim()
    .toLowerCase();
  const source = text || DEFAULT_BLEND_SCENARIOS.join(',');
  const parsed = source
    .split(',')
    .map((item) => Number(item.trim()))
    .filter(Number.isFinite)
    .map((value) => Math.max(0, Math.min(1, Number(value.toFixed(3)))));
  const uniqueSorted = [...new Set(parsed)].sort((a, b) => a - b);
  return uniqueSorted.length > 0 ? uniqueSorted : DEFAULT_BLEND_SCENARIOS;
}

function profileCompleteness(profile) {
  const skills = Array.isArray(profile?.skills) ? profile.skills.filter(Boolean).length : 0;
  const interests = Array.isArray(profile?.interests) ? profile.interests.filter(Boolean).length : 0;
  const availability = Array.isArray(profile?.available_choices) ? profile.available_choices.filter(Boolean).length : 0;
  const hours = safeNumber(profile?.total_hours, 0);
  return {
    skills,
    interests,
    availability,
    hours,
    completeness: Number(skills > 0) + Number(interests > 0) + Number(availability > 0) + Number(hours > 0),
  };
}

function runSnapshotInMode({ userIds, mode, blendWeight = null, scoringMode = null }) {
  const evalScript = `
    import { getRecommendationsForUser } from './src/recommendations/recommendations.service.js';
    const norm = (value) => String(value ?? '').trim().toLowerCase();
    const userIds = ${JSON.stringify(userIds)};
    const out = [];
    for (const userId of userIds) {
      try {
        const payload = await getRecommendationsForUser(userId, 24);
        const activities = Array.isArray(payload.activities) ? payload.activities : [];
        const excluded = Array.isArray(payload.excluded_items) ? payload.excluded_items : [];
        const rows = [...activities, ...excluded].map((row) => ({
          title: row.title ?? row.activity_id ?? null,
          score: Number(row.matchScore ?? 0),
          decision: row?.ai_decision?.decision ?? row?.decision ?? null,
          tier: row?.match_tier ?? null,
          reason: row?.ai_decision?.decision_reason ?? row?.reason ?? null,
          display_reasons: Array.isArray(row?.display_reasons) ? row.display_reasons : [],
          matched_skills: Array.isArray(row?.feature_snapshot?.matched_skills) ? row.feature_snapshot.matched_skills : [],
          matched_interests: Array.isArray(row?.feature_snapshot?.matched_interests) ? row.feature_snapshot.matched_interests : [],
          required_skills: Array.isArray(row?.feature_snapshot?.required_skills) ? row.feature_snapshot.required_skills : [],
          availability_match: Boolean(row?.feature_snapshot?.availability_match),
          history_count: Number(row?.feature_snapshot?.organizer_history_count ?? 0),
          model_kind: row?.model_kind ?? null,
          strategy: row?.prediction_snapshot?.strategy ?? null,
          scoring_strategy: row?.prediction_snapshot?.scoring_strategy ?? null,
          heuristic_score: row?.prediction_snapshot?.heuristic_score ?? null,
          ml_score: row?.prediction_snapshot?.ml_score ?? null,
          blended_score: row?.prediction_snapshot?.blended_score ?? null,
          blend_weight: row?.prediction_snapshot?.blend_weight ?? null,
          probability: row?.prediction_snapshot?.probability ?? null,
        }));

        const includedRecommend = activities.filter((row) => norm(row?.ai_decision?.decision) === 'recommend');
        const includedConsider = activities.filter((row) => norm(row?.ai_decision?.decision) === 'consider');
        out.push({
          user_id: userId,
          model_kind: payload?.ai_recommendation_session?.model_kind ?? null,
          fallback_used: Boolean(payload?.ai_recommendation_session?.fallback_used),
          recommended_count: includedRecommend.length,
          consider_count: includedConsider.length,
          candidate_count: Number(payload?.ai_recommendation_session?.candidate_count ?? rows.length),
          activities: activities.map((row) => ({
            title: row.title,
            score: Number(row.matchScore ?? 0),
            decision: row?.ai_decision?.decision ?? null,
            tier: row?.match_tier ?? null,
            reason: row?.ai_decision?.decision_reason ?? null,
            display_reasons: Array.isArray(row?.display_reasons) ? row.display_reasons : [],
            matched_skills: Array.isArray(row?.feature_snapshot?.matched_skills) ? row.feature_snapshot.matched_skills : [],
            matched_interests: Array.isArray(row?.feature_snapshot?.matched_interests) ? row.feature_snapshot.matched_interests : [],
            required_skills: Array.isArray(row?.feature_snapshot?.required_skills) ? row.feature_snapshot.required_skills : [],
            availability_match: Boolean(row?.feature_snapshot?.availability_match),
            history_count: Number(row?.feature_snapshot?.organizer_history_count ?? 0),
            model_kind: row?.model_kind ?? null,
            strategy: row?.prediction_snapshot?.strategy ?? null,
            scoring_strategy: row?.prediction_snapshot?.scoring_strategy ?? null,
            heuristic_score: row?.prediction_snapshot?.heuristic_score ?? null,
            ml_score: row?.prediction_snapshot?.ml_score ?? null,
            blended_score: row?.prediction_snapshot?.blended_score ?? null,
            blend_weight: row?.prediction_snapshot?.blend_weight ?? null,
            probability: row?.prediction_snapshot?.probability ?? null,
          })),
          all_rows: rows,
        });
      } catch (error) {
        out.push({ user_id: userId, error: error instanceof Error ? error.message : String(error) });
      }
    }
    console.log(JSON.stringify(out));
  `;

  const env = {
    ...process.env,
    RECOMMENDATION_ML_FORCE_HEURISTIC: mode === 'heuristic' ? 'true' : 'false',
  };
  if (blendWeight != null) {
    env.RECOMMENDATION_ML_BLEND_WEIGHT = String(blendWeight);
  }
  if (scoringMode) {
    env.RECOMMENDATION_SCORING_MODE = String(scoringMode);
  }

  const child = spawnSync(process.execPath, ['--input-type=module', '-e', evalScript], {
    cwd: path.resolve(__dirname, '..'),
    env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });

  if (child.status !== 0) {
    throw new Error(`Snapshot mode=${mode} failed: ${child.stderr || child.stdout || `exit ${child.status}`}`);
  }

  const stdout = String(child.stdout ?? '').trim();
  const parsed = JSON.parse(stdout.split('\n').pop() ?? '[]');
  return Array.isArray(parsed) ? parsed : [];
}

function summarizeScoreDistribution(rows) {
  const scores = rows.map((row) => safeNumber(row.score, 0)).filter((value) => Number.isFinite(value));
  if (scores.length === 0) {
    return {
      min: 0,
      max: 0,
      average: 0,
      ge75: 0,
      b60_74: 0,
      b35_59: 0,
      lt35: 0,
      repeated_scores: [],
    };
  }

  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const average = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  let ge75 = 0;
  let b60_74 = 0;
  let b35_59 = 0;
  let lt35 = 0;
  const scoreFreq = new Map();

  for (const score of scores) {
    if (score >= 75) ge75 += 1;
    else if (score >= 60) b60_74 += 1;
    else if (score >= 35) b35_59 += 1;
    else lt35 += 1;

    const key = Number(score.toFixed(1));
    scoreFreq.set(key, (scoreFreq.get(key) ?? 0) + 1);
  }

  const repeated = [...scoreFreq.entries()]
    .filter(([, count]) => count >= 5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([score, count]) => ({ score, count }));

  return {
    min: Number(min.toFixed(3)),
    max: Number(max.toFixed(3)),
    average: Number(average.toFixed(3)),
    ge75,
    b60_74,
    b35_59,
    lt35,
    repeated_scores: repeated,
  };
}

function artifactSummary() {
  if (!fs.existsSync(ARTIFACT_PATH)) {
    return { exists: false };
  }
  const parsed = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));
  const sampleSize = safeNumber(parsed.sample_size, 0);
  const splitIndex = Math.floor(sampleSize * 0.8);
  return {
    exists: true,
    model_version: parsed.model_version ?? null,
    trained_at: parsed.trained_at ?? null,
    sample_size: sampleSize,
    train_size: splitIndex,
    test_size: Math.max(0, sampleSize - splitIndex),
    low_sample_mode_used: Boolean(parsed?.training_config?.low_sample_mode_used),
    metrics: parsed.metrics ?? null,
    weights: parsed.weights ?? null,
    weight_sanity: parsed.weight_sanity ?? null,
    feature_stats: parsed.feature_stats ?? null,
  };
}

function pickTopActivity(snapshot) {
  const rows = Array.isArray(snapshot?.activities) ? snapshot.activities : [];
  return rows[0] ?? null;
}

function buildComparisonRows({ baselineUsers, mlById, heuristicById }) {
  return baselineUsers.map((user) => {
    const ml = mlById.get(user.id) ?? {};
    const heuristic = heuristicById.get(user.id) ?? {};
    const mlTop = pickTopActivity(ml);
    const heuristicTop = pickTopActivity(heuristic);

    const mlTopMatchedSkills = Array.isArray(mlTop?.matched_skills) ? mlTop.matched_skills : [];
    const heurTopMatchedSkills = Array.isArray(heuristicTop?.matched_skills) ? heuristicTop.matched_skills : [];

    const scoreDiff = safeNumber(mlTop?.score, 0) - safeNumber(heuristicTop?.score, 0);
    const possibleRegression =
      Boolean(heuristicTop) &&
      heurTopMatchedSkills.length > 0 &&
      Boolean(mlTop) &&
      mlTopMatchedSkills.length === 0 &&
      scoreDiff > 10;

    return {
      user_id: user.id,
      user_name: user.full_name,
      user_type: user.user_type,
      heuristic_top: heuristicTop
        ? {
            title: heuristicTop.title,
            score: heuristicTop.score,
            decision: heuristicTop.decision,
            tier: heuristicTop.tier,
            reasons: heuristicTop.display_reasons,
            matched_skills: heurTopMatchedSkills,
          }
        : null,
      ml_top: mlTop
        ? {
            title: mlTop.title,
            score: mlTop.score,
            decision: mlTop.decision,
            tier: mlTop.tier,
            reasons: mlTop.display_reasons,
            matched_skills: mlTopMatchedSkills,
            heuristic_score: mlTop.heuristic_score,
            ml_score: mlTop.ml_score,
            blended_score: mlTop.blended_score,
            blend_weight: mlTop.blend_weight,
            scoring_strategy: mlTop.scoring_strategy,
          }
        : null,
      ml_better: scoreDiff > 0,
      score_diff_ml_minus_heuristic: Number(scoreDiff.toFixed(3)),
      regression_flag: possibleRegression,
      model_kind_ml: ml?.model_kind ?? null,
      model_kind_heuristic: heuristic?.model_kind ?? null,
    };
  });
}

function computeBaselineHealth(comparisonRows) {
  let regressionCount = 0;
  let mlBetterCount = 0;
  for (const row of comparisonRows) {
    if (row.regression_flag) {
      regressionCount += 1;
    }
    if (row.ml_better) {
      mlBetterCount += 1;
    }
  }
  return {
    regression_count: regressionCount,
    ml_better_count: mlBetterCount,
    baseline_count: comparisonRows.length,
  };
}

function summarizeBlendScenario({
  blendWeight,
  scoringMode,
  artifact,
  baselineUsers,
  heuristicById,
  baselineIds,
  volunteerIds,
}) {
  const mlSnapshots = runSnapshotInMode({
    userIds: baselineIds,
    mode: 'ml',
    blendWeight,
    scoringMode,
  });
  const mlById = new Map(mlSnapshots.map((row) => [row.user_id, row]));
  const comparisonRows = buildComparisonRows({ baselineUsers, mlById, heuristicById });
  const baselineHealth = computeBaselineHealth(comparisonRows);

  const allVolunteerMlSnapshots = runSnapshotInMode({
    userIds: volunteerIds,
    mode: 'ml',
    blendWeight,
    scoringMode,
  });
  const allMlRows = allVolunteerMlSnapshots.flatMap((item) => (Array.isArray(item.all_rows) ? item.all_rows : []));
  const scoreDist = summarizeScoreDistribution(allMlRows);
  const verdict = verdictFromSignals({
    artifact,
    baselineHealth,
    scoreDist,
  });

  return {
    blend_weight: blendWeight,
    scoring_mode: scoringMode,
    accuracy: safeNumber(artifact?.metrics?.test?.accuracy, 0),
    f1: safeNumber(artifact?.metrics?.test?.f1, 0),
    regression_count: baselineHealth.regression_count,
    ml_better_count: baselineHealth.ml_better_count,
    baseline_count: baselineHealth.baseline_count,
    score_distribution: scoreDist,
    verdict,
    baseline_comparison: comparisonRows,
  };
}

function pickBestBlendScenario(scenarios) {
  const eligible = (Array.isArray(scenarios) ? scenarios : []).filter(
    (scenario) =>
      String(scenario?.verdict ?? '') === 'ML_READY_TO_USE' &&
      safeNumber(scenario?.regression_count, 0) === 0
  );
  if (eligible.length === 0) {
    return null;
  }

  const sorted = eligible
    .slice()
    .sort((left, right) => {
      const leftBlend = safeNumber(left?.blend_weight, 0);
      const rightBlend = safeNumber(right?.blend_weight, 0);
      if (rightBlend !== leftBlend) {
        return rightBlend - leftBlend;
      }
      const leftBetter = safeNumber(left?.ml_better_count, 0);
      const rightBetter = safeNumber(right?.ml_better_count, 0);
      if (rightBetter !== leftBetter) {
        return rightBetter - leftBetter;
      }
      return safeNumber(right?.f1, 0) - safeNumber(left?.f1, 0);
    });
  return sorted[0] ?? null;
}

function verdictFromSignals({ artifact, baselineHealth, scoreDist }) {
  if (!artifact.exists) {
    return 'ML_NOT_SAFE_USE_HEURISTIC';
  }

  const sample = safeNumber(artifact.sample_size, 0);
  const lowSample = Boolean(artifact.low_sample_mode_used);
  const testMetrics = artifact?.metrics?.test ?? null;
  const missingCriticalMetrics =
    !testMetrics ||
    !Number.isFinite(safeNumber(testMetrics.accuracy, NaN)) ||
    !Number.isFinite(safeNumber(testMetrics.precision, NaN)) ||
    !Number.isFinite(safeNumber(testMetrics.recall, NaN)) ||
    !Number.isFinite(safeNumber(testMetrics.f1, NaN));
  const historyDominanceRatio = safeNumber(artifact?.weight_sanity?.history_dominance_ratio, NaN);
  const strongHistoryDominance = Number.isFinite(historyDominanceRatio) && historyDominanceRatio > 2.5;
  const totalScores = Math.max(
    1,
    safeNumber(scoreDist.ge75, 0) + safeNumber(scoreDist.b60_74, 0) + safeNumber(scoreDist.b35_59, 0) + safeNumber(scoreDist.lt35, 0)
  );
  const maxRepeatedCount = (scoreDist.repeated_scores ?? []).reduce(
    (max, item) => Math.max(max, Number(item?.count ?? 0)),
    0
  );
  const maxRepeatedRatio = maxRepeatedCount / totalScores;
  const lowScoreRatio = safeNumber(scoreDist.lt35, 0) / totalScores;
  const heavyRepeatedCluster = maxRepeatedRatio >= 0.22 && lowScoreRatio >= 0.65;

  if (
    sample < 100 ||
    lowSample ||
    missingCriticalMetrics ||
    strongHistoryDominance ||
    baselineHealth.regression_count > 0
  ) {
    return 'ML_NOT_SAFE_USE_HEURISTIC';
  }

  if (
    sample < 300 ||
    safeNumber(testMetrics.accuracy, 0) < 0.8 ||
    safeNumber(testMetrics.f1, 0) < 0.78 ||
    heavyRepeatedCluster
  ) {
    return 'ML_TRAINED_BUT_RISKY';
  }

  return 'ML_READY_TO_USE';
}

function writeEvaluationArtifacts(result) {
  fs.mkdirSync(path.dirname(EVALUATION_OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(EVALUATION_OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  if (!fs.existsSync(ARTIFACT_PATH)) {
    return;
  }

  const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));
  artifact.evaluation_summary = {
    evaluated_at: new Date().toISOString(),
    verdict: result.verdict,
    baseline_health: result.baseline_health,
    score_distribution: result.ml_score_distribution,
  };
  fs.writeFileSync(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
}

async function main() {
  const artifact = artifactSummary();

  const { data: users, error: usersError } = await supabaseAdmin
    .from('users')
    .select('id, full_name, role, status, deleted_at')
    .eq('role', 'volunteer')
    .eq('status', 'active')
    .is('deleted_at', null)
    .limit(500);
  if (usersError) throw new Error(usersError.message);

  const volunteerRows = Array.isArray(users) ? users : [];
  const volunteerIds = volunteerRows.map((row) => row.id).filter(Boolean);
  const { data: profiles, error: profilesError } = volunteerIds.length
    ? await supabaseAdmin
        .from('volunteer_profiles')
        .select('user_id, skills, interests, available_choices, total_hours')
        .in('user_id', volunteerIds)
    : { data: [], error: null };
  if (profilesError) throw new Error(profilesError.message);
  const profileById = new Map((profiles ?? []).map((row) => [row.user_id, row]));

  const candidates = volunteerRows.map((row) => {
    const profile = profileById.get(row.id) ?? null;
    const completeness = profileCompleteness(profile);
    return {
      id: row.id,
      full_name: row.full_name,
      ...completeness,
    };
  });

  const findBestByName = (nameNeedle) =>
    candidates
      .filter((row) => normalize(row.full_name).includes(normalize(nameNeedle)))
      .sort((a, b) => b.completeness - a.completeness || b.skills - a.skills || b.availability - a.availability)[0] ?? null;

  const truongLoc = findBestByName('Truong Loc');
  const johnVolunteer = findBestByName('John Volunteer');
  const coldStart = candidates
    .filter((row) => row.id !== truongLoc?.id && row.id !== johnVolunteer?.id)
    .sort((a, b) => a.completeness - b.completeness || a.skills - b.skills || a.interests - b.interests || a.availability - b.availability)[0] ?? null;

  const seedUsers = candidates
    .filter((row) => normalize(row.full_name).startsWith('ml seed volunteer'))
    .filter((row) => row.id !== truongLoc?.id && row.id !== johnVolunteer?.id && row.id !== coldStart?.id)
    .slice(0, MAX_SEED_USERS)
    .map((row) => ({ ...row, user_type: 'seed' }));

  const baselineUsers = [
    truongLoc ? { ...truongLoc, user_type: 'truong_loc' } : null,
    johnVolunteer ? { ...johnVolunteer, user_type: 'john_volunteer' } : null,
    coldStart ? { ...coldStart, user_type: 'cold_start' } : null,
    ...seedUsers,
  ].filter(Boolean);

  if (baselineUsers.length === 0) {
    throw new Error('No volunteer users found for evaluation baseline.');
  }

  const baselineIds = baselineUsers.map((row) => row.id);
  const blendScenarios = parseBlendWeights(process.env.RECOMMENDATION_ML_EVAL_BLEND_WEIGHTS);
  const scoringMode = String(process.env.RECOMMENDATION_SCORING_MODE ?? 'hybrid_blend')
    .trim()
    .toLowerCase();

  const mlSnapshots = runSnapshotInMode({
    userIds: baselineIds,
    mode: 'ml',
    blendWeight: safeNumber(process.env.RECOMMENDATION_ML_BLEND_WEIGHT ?? 0.25, 0.25),
    scoringMode,
  });
  const heuristicSnapshots = runSnapshotInMode({ userIds: baselineIds, mode: 'heuristic' });
  const mlById = new Map(mlSnapshots.map((row) => [row.user_id, row]));
  const heuristicById = new Map(heuristicSnapshots.map((row) => [row.user_id, row]));

  const comparisonRows = buildComparisonRows({ baselineUsers, mlById, heuristicById });
  const baselineHealth = computeBaselineHealth(comparisonRows);

  const allVolunteerMlSnapshots = runSnapshotInMode({
    userIds: volunteerIds,
    mode: 'ml',
    blendWeight: safeNumber(process.env.RECOMMENDATION_ML_BLEND_WEIGHT ?? 0.25, 0.25),
    scoringMode,
  });
  const allMlRows = allVolunteerMlSnapshots.flatMap((item) => (Array.isArray(item.all_rows) ? item.all_rows : []));
  const scoreDist = summarizeScoreDistribution(allMlRows);

  const verdict = verdictFromSignals({
    artifact,
    baselineHealth,
    scoreDist,
  });

  const blend_experiments = blendScenarios.map((weight) =>
    summarizeBlendScenario({
      blendWeight: weight,
      scoringMode,
      artifact,
      baselineUsers,
      heuristicById,
      baselineIds,
      volunteerIds,
    })
  );
  const recommendedBlend = pickBestBlendScenario(blend_experiments);

  const result = {
    evaluated_at: new Date().toISOString(),
    verdict,
    artifact,
    baseline_users: baselineUsers,
    baseline_health: baselineHealth,
    ml_vs_heuristic_baseline: comparisonRows,
    ml_score_distribution: scoreDist,
    blend_experiments,
    blend_recommendation: recommendedBlend
      ? {
          blend_weight: recommendedBlend.blend_weight,
          scoring_mode: recommendedBlend.scoring_mode,
          rationale: 'highest safe ML influence among READY scenarios with zero baseline regression',
        }
      : null,
    output_file: EVALUATION_OUTPUT_PATH,
  };

  writeEvaluationArtifacts(result);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[evaluateRecommendationMlV1] failed: ${message}`);
  process.exitCode = 1;
});
