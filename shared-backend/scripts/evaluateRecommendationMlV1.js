import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { supabaseAdmin } from '../src/database/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_PATH = path.resolve(__dirname, '../src/recommendations/artifacts/recommendation-ml-v1.json');

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
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

function runSnapshotInMode({ userIds, mode }) {
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
          required_skills: Array.isArray(row?.feature_snapshot?.required_skills) ? row.feature_snapshot.required_skills : [],
          availability_match: Boolean(row?.feature_snapshot?.availability_match),
          history_count: Number(row?.feature_snapshot?.organizer_history_count ?? 0),
          model_kind: row?.model_kind ?? null,
          strategy: row?.prediction_snapshot?.strategy ?? null,
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
            required_skills: Array.isArray(row?.feature_snapshot?.required_skills) ? row.feature_snapshot.required_skills : [],
            availability_match: Boolean(row?.feature_snapshot?.availability_match),
            history_count: Number(row?.feature_snapshot?.organizer_history_count ?? 0),
            model_kind: row?.model_kind ?? null,
            strategy: row?.prediction_snapshot?.strategy ?? null,
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

  const child = spawnSync(process.execPath, ['--input-type=module', '-e', evalScript], {
    cwd: path.resolve(__dirname, '..'),
    env,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (child.status !== 0) {
    throw new Error(
      `Snapshot mode=${mode} failed: ${child.stderr || child.stdout || `exit ${child.status}`}`
    );
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
    .slice(0, 10)
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
    bias: parsed.bias ?? null,
  };
}

function verdictFromSignals({ artifact, baselineDiff, scoreDist }) {
  if (!artifact.exists) return 'ML_NOT_SAFE_USE_HEURISTIC';
  const weights = artifact.weights ?? {};
  const skill = safeNumber(weights.skill_ratio, 0);
  const interest = safeNumber(weights.interest_ratio, 0);
  const availability = safeNumber(weights.availability_ratio, 0);
  const history = safeNumber(weights.history_ratio, 0);
  const lowSample = Boolean(artifact.low_sample_mode_used);
  const sample = safeNumber(artifact.sample_size, 0);

  const criticalWeightIssue =
    skill < -0.1 ||
    interest === 0 ||
    availability < -0.1 ||
    history > Math.max(Math.abs(skill), Math.abs(availability), Math.abs(interest), 0.0001) * 1.8;

  const heavyCluster = scoreDist.repeated_scores.some((item) => item.count >= 20);
  const hasRegression = baselineDiff.some((row) => row.regression_flag === true);

  if (sample < 120 || lowSample || criticalWeightIssue || hasRegression) {
    return 'ML_NOT_SAFE_USE_HEURISTIC';
  }
  if (sample < 300 || heavyCluster) {
    return 'ML_TRAINED_BUT_RISKY';
  }
  return 'ML_READY_TO_USE';
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

  const truongLocCandidates = candidates
    .filter((row) => normalize(row.full_name).includes('truong loc'))
    .sort((a, b) => b.completeness - a.completeness || b.skills - a.skills || b.availability - a.availability);
  const truongLoc = truongLocCandidates[0] ?? null;

  const fullProfile = candidates
    .filter((row) => row.id !== truongLoc?.id)
    .sort((a, b) => {
      const left = b.completeness - a.completeness;
      if (left !== 0) return left;
      const right = b.skills + b.interests + b.availability - (a.skills + a.interests + a.availability);
      if (right !== 0) return right;
      return b.hours - a.hours;
    })[0];

  const coldStart = candidates
    .filter((row) => row.id !== truongLoc?.id && row.id !== fullProfile?.id)
    .sort((a, b) => {
      const left = a.completeness - b.completeness;
      if (left !== 0) return left;
      const right = a.skills + a.interests + a.availability - (b.skills + b.interests + b.availability);
      if (right !== 0) return right;
      return a.hours - b.hours;
    })[0];

  const baselineUsers = [truongLoc, fullProfile, coldStart].filter(Boolean);
  const baselineIds = baselineUsers.map((row) => row.id);

  const mlSnapshots = runSnapshotInMode({ userIds: baselineIds, mode: 'ml' });
  const heuristicSnapshots = runSnapshotInMode({ userIds: baselineIds, mode: 'heuristic' });
  const mlById = new Map(mlSnapshots.map((row) => [row.user_id, row]));
  const heuristicById = new Map(heuristicSnapshots.map((row) => [row.user_id, row]));

  const compareRows = baselineUsers.map((user) => {
    const ml = mlById.get(user.id) ?? {};
    const heuristic = heuristicById.get(user.id) ?? {};
    const mlTop = Array.isArray(ml.activities) ? ml.activities[0] ?? null : null;
    const heuristicTop = Array.isArray(heuristic.activities) ? heuristic.activities[0] ?? null : null;
    const mlTopMatchedSkills = Array.isArray(mlTop?.matched_skills) ? mlTop.matched_skills : [];
    const heurTopMatchedSkills = Array.isArray(heuristicTop?.matched_skills) ? heuristicTop.matched_skills : [];

    const regression =
      Boolean(heuristicTop) &&
      heurTopMatchedSkills.length > 0 &&
      Boolean(mlTop) &&
      mlTopMatchedSkills.length === 0 &&
      safeNumber(mlTop?.score, 0) > safeNumber(heuristicTop?.score, 0);

    return {
      user_id: user.id,
      user_name: user.full_name,
      heuristic_top: heuristicTop
        ? {
            title: heuristicTop.title,
            score: heuristicTop.score,
            decision: heuristicTop.decision,
            matched_skills: heurTopMatchedSkills,
          }
        : null,
      ml_top: mlTop
        ? {
            title: mlTop.title,
            score: mlTop.score,
            decision: mlTop.decision,
            matched_skills: mlTopMatchedSkills,
            reason: mlTop.reason,
          }
        : null,
      heuristic_model_kind: heuristic?.model_kind ?? null,
      ml_model_kind: ml?.model_kind ?? null,
      regression_flag: regression,
    };
  });

  const allVolunteerMlSnapshots = runSnapshotInMode({ userIds: volunteerIds, mode: 'ml' });
  const allMlRows = allVolunteerMlSnapshots.flatMap((item) => (Array.isArray(item.all_rows) ? item.all_rows : []));
  const scoreDist = summarizeScoreDistribution(allMlRows);

  const verdict = verdictFromSignals({
    artifact,
    baselineDiff: compareRows,
    scoreDist,
  });

  console.log(
    JSON.stringify(
      {
        verdict,
        artifact,
        baseline_users: baselineUsers,
        ml_vs_heuristic_baseline: compareRows,
        ml_score_distribution: scoreDist,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[evaluateRecommendationMlV1] failed: ${message}`);
  process.exitCode = 1;
});
