import { supabaseAdmin } from '../src/database/supabase.js';
import { getActivityById } from '../src/activities/activities.service.js';
import {
  findOutOfCatalogInterests,
  resolveInterestCatalogSource,
  uniqueCanonicalInterests,
} from './lib/interestCatalogSource.js';

const POSITIVE_STATUSES = new Set(['approved', 'checked_in']);
const NEGATIVE_STATUSES = new Set(['rejected', 'cancelled']);
const MAX_SAMPLES = Number(process.env.RECOMMENDATION_ML_MAX_SAMPLES ?? 4000);
const FETCH_LIMIT = Math.max(1, Math.trunc(MAX_SAMPLES * 2));
const SEED_PREFIX = String(process.env.RECOMMENDATION_ML_SEED_PREFIX ?? 'ML Seed').trim() || 'ML Seed';

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function bump(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function toSortedObjectFromMap(map, numericKey = false) {
  const entries = [...map.entries()];
  entries.sort((a, b) => {
    if (numericKey) {
      return Number(a[0]) - Number(b[0]);
    }
    return String(a[0]).localeCompare(String(b[0]));
  });
  return Object.fromEntries(entries);
}

function computeVerdict(summary) {
  const effectiveSamples = Number(summary.activity_participations.effective_samples ?? 0);
  const positiveRatio = Number(summary.activity_participations.positive_ratio ?? 0);
  const negativeRatio = Number(summary.activity_participations.negative_ratio ?? 0);
  const missingActivityRecord = Number(summary.activity_participations.skipped.skipped_missing_activity_record ?? 0);
  const emptyInterests = Number(summary.volunteer_profiles.empty_interests ?? 0);
  const emptyAvailability = Number(summary.volunteer_profiles.empty_available_choices ?? 0);
  const profileBase = Math.max(1, Number(summary.volunteer_profiles.effective_unique_volunteers ?? 0));
  const interestsEmptyRate = emptyInterests / profileBase;
  const availabilityEmptyRate = emptyAvailability / profileBase;
  const effectiveSkillHistogram = summary.activities.effective_sample_required_skills_histogram ?? {};
  const effectiveSkillCounts = Object.entries(effectiveSkillHistogram).map(([key, value]) => ({
    count: Number(value ?? 0),
    skill_len: Number(key),
  }));
  const effectiveSkillTotal = Math.max(
    1,
    effectiveSkillCounts.reduce((sum, item) => sum + (Number.isFinite(item.count) ? item.count : 0), 0)
  );
  const effectiveSkill2To4 = effectiveSkillCounts
    .filter((item) => item.skill_len >= 2 && item.skill_len <= 4)
    .reduce((sum, item) => sum + item.count, 0);
  const effectiveSkill2To4Rate = effectiveSkill2To4 / effectiveSkillTotal;
  const missingActivityRate = missingActivityRecord / Math.max(1, effectiveSamples + missingActivityRecord);

  const distributionSkewed = positiveRatio > 0.7 || negativeRatio > 0.7;
  const distributionTooImbalanced = positiveRatio < 0.35 || negativeRatio < 0.35;
  const interestCatalogMismatch = Boolean(summary.interest_catalog?.fe_db_mismatch?.has_mismatch);
  const profileOutOfCatalogInterests = Number(summary.volunteer_profiles.out_of_catalog_interests_count ?? 0);
  const seedOutOfCatalogInterests = Number(summary.seed_profiles.out_of_catalog_interests_count ?? 0);

  if (
    effectiveSamples < 100 ||
    distributionSkewed ||
    distributionTooImbalanced ||
    effectiveSkill2To4Rate < 0.25 ||
    interestsEmptyRate > 0.75 ||
    availabilityEmptyRate > 0.75 ||
    interestCatalogMismatch ||
    seedOutOfCatalogInterests > 0
  ) {
    return 'NOT_READY_TO_TRAIN';
  }

  if (
    effectiveSamples < 300 ||
    effectiveSkill2To4Rate < 0.5 ||
    interestsEmptyRate > 0.5 ||
    availabilityEmptyRate > 0.4 ||
    missingActivityRate > 0.2 ||
    profileOutOfCatalogInterests > 0
  ) {
    return 'TRAINABLE_BUT_RISKY';
  }

  return 'READY_TO_TRAIN';
}

async function readCoreSkillSet() {
  const attempts = ['skill_name', 'name', 'label'];
  for (const column of attempts) {
    const { data, error } = await supabaseAdmin.from('core_skills').select(column).limit(2000);
    if (error) {
      continue;
    }
    const values = (data ?? []).map((row) => normalize(row?.[column])).filter(Boolean);
    return new Set(values);
  }
  return new Set();
}

async function main() {
  const interestCatalog = await resolveInterestCatalogSource(supabaseAdmin, { preferDbWhenAvailable: true });
  const { data: rows, error: rowsError } = await supabaseAdmin
    .from('activity_participations')
    .select('id, activity_id, volunteer_id, status, created_at')
    .order('created_at', { ascending: false })
    .limit(FETCH_LIMIT);
  if (rowsError) {
    throw new Error(rowsError.message);
  }

  const fetchedRows = Array.isArray(rows) ? rows : [];
  const statusHistogramFetched = new Map();
  const statusHistogramLabeled = new Map();
  const statusHistogramAccepted = new Map();
  const activityCache = new Map();
  const effectiveRows = [];

  let accepted = 0;
  let acceptedPositive = 0;
  let acceptedNegative = 0;
  let skippedUnlabeledStatus = 0;
  let skippedMissingActivityId = 0;
  let skippedMissingVolunteerId = 0;
  let skippedMissingActivityRecord = 0;

  for (const row of fetchedRows) {
    const status = normalize(row.status) || '(empty)';
    bump(statusHistogramFetched, status);

    const label = POSITIVE_STATUSES.has(status) ? 1 : NEGATIVE_STATUSES.has(status) ? 0 : null;
    if (label == null) {
      skippedUnlabeledStatus += 1;
      continue;
    }
    bump(statusHistogramLabeled, status);

    if (!row.activity_id) {
      skippedMissingActivityId += 1;
      continue;
    }
    if (!row.volunteer_id) {
      skippedMissingVolunteerId += 1;
      continue;
    }

    if (!activityCache.has(row.activity_id)) {
      activityCache.set(row.activity_id, await getActivityById(row.activity_id));
    }
    const activity = activityCache.get(row.activity_id);
    if (!activity) {
      skippedMissingActivityRecord += 1;
      continue;
    }

    accepted += 1;
    if (label === 1) {
      acceptedPositive += 1;
    } else {
      acceptedNegative += 1;
    }
    bump(statusHistogramAccepted, status);
    effectiveRows.push({ ...row, label });
    if (accepted >= MAX_SAMPLES) {
      break;
    }
  }

  const effectiveVolunteerIds = [...new Set(effectiveRows.map((row) => row.volunteer_id).filter(Boolean))];
  const effectiveActivityIds = [...new Set(effectiveRows.map((row) => row.activity_id).filter(Boolean))];

  const { data: profiles, error: profilesError } = effectiveVolunteerIds.length
    ? await supabaseAdmin
        .from('volunteer_profiles')
        .select('user_id, skills, interests, available_choices, total_hours')
        .in('user_id', effectiveVolunteerIds)
    : { data: [], error: null };
  if (profilesError) {
    throw new Error(profilesError.message);
  }
  const profileById = new Map((profiles ?? []).map((row) => [row.user_id, row]));

  let missingProfile = 0;
  let emptySkills = 0;
  let emptyInterests = 0;
  let emptyAvailableChoices = 0;
  let fullWeekAvailability = 0;
  let totalHoursZeroOrInvalid = 0;
  const profileOutOfCatalogMap = new Map();

  for (const volunteerId of effectiveVolunteerIds) {
    const profile = profileById.get(volunteerId);
    if (!profile) {
      missingProfile += 1;
      emptySkills += 1;
      emptyInterests += 1;
      emptyAvailableChoices += 1;
      totalHoursZeroOrInvalid += 1;
      continue;
    }

    const skills = Array.isArray(profile.skills) ? profile.skills.filter(Boolean) : [];
    const interests = Array.isArray(profile.interests) ? profile.interests.filter(Boolean) : [];
    const availableChoices = Array.isArray(profile.available_choices) ? profile.available_choices.filter(Boolean) : [];
    const totalHours = Number(profile.total_hours ?? 0);

    if (skills.length === 0) emptySkills += 1;
    if (interests.length === 0) emptyInterests += 1;
    if (availableChoices.length === 0) emptyAvailableChoices += 1;
    if (availableChoices.length >= 21) fullWeekAvailability += 1;
    if (!Number.isFinite(totalHours) || totalHours <= 0) totalHoursZeroOrInvalid += 1;

    const outOfCatalog = findOutOfCatalogInterests(interests, interestCatalog.selected_catalog);
    if (outOfCatalog.length > 0) {
      profileOutOfCatalogMap.set(volunteerId, outOfCatalog);
    }
  }

  const allOutOfCatalogProfileInterests = uniqueCanonicalInterests(
    Array.from(profileOutOfCatalogMap.values()).flatMap((values) => values)
  );

  const { data: seedUsersData, error: seedUsersError } = await supabaseAdmin
    .from('users')
    .select('id, full_name')
    .eq('role', 'volunteer')
    .ilike('full_name', `${SEED_PREFIX} Volunteer %`)
    .is('deleted_at', null)
    .limit(5000);
  if (seedUsersError) {
    throw new Error(seedUsersError.message);
  }
  const seedUserIds = (seedUsersData ?? []).map((row) => row.id).filter(Boolean);
  const seedUserNameById = new Map((seedUsersData ?? []).map((row) => [row.id, String(row?.full_name ?? '').trim()]));
  const { data: seedProfileRows, error: seedProfilesError } = seedUserIds.length
    ? await supabaseAdmin.from('volunteer_profiles').select('user_id, interests').in('user_id', seedUserIds)
    : { data: [], error: null };
  if (seedProfilesError) {
    throw new Error(seedProfilesError.message);
  }

  const seedOutOfCatalogMap = new Map();
  for (const row of seedProfileRows ?? []) {
    const interests = Array.isArray(row?.interests) ? row.interests : [];
    const outOfCatalog = findOutOfCatalogInterests(interests, interestCatalog.selected_catalog);
    if (outOfCatalog.length > 0) {
      const userId = String(row?.user_id ?? '').trim();
      seedOutOfCatalogMap.set(userId, {
        full_name: seedUserNameById.get(userId) ?? '',
        interests: outOfCatalog,
      });
    }
  }
  const allOutOfCatalogSeedInterests = uniqueCanonicalInterests(
    Array.from(seedOutOfCatalogMap.values()).flatMap((entry) => entry.interests)
  );

  const { data: activeActivities, error: activeActivitiesError } = await supabaseAdmin
    .from('activities')
    .select('id, required_skills, status, deleted_at, end_time')
    .eq('status', 'published')
    .is('deleted_at', null)
    .gte('end_time', new Date().toISOString())
    .limit(2000);
  if (activeActivitiesError) {
    throw new Error(activeActivitiesError.message);
  }

  const requiredSkillsHistogram = new Map();
  const effectiveSampleRequiredSkillsHistogram = new Map();
  const activeSkillVocabulary = new Set();
  let requiredSkillsEmpty = 0;
  let requiredSkillsOne = 0;
  let requiredSkills2To4 = 0;
  let requiredSkillsGt4 = 0;

  for (const row of activeActivities ?? []) {
    const requiredSkills = Array.isArray(row.required_skills) ? row.required_skills.filter(Boolean) : [];
    bump(requiredSkillsHistogram, String(requiredSkills.length));
    if (requiredSkills.length === 0) requiredSkillsEmpty += 1;
    else if (requiredSkills.length === 1) requiredSkillsOne += 1;
    else if (requiredSkills.length <= 4) requiredSkills2To4 += 1;
    else requiredSkillsGt4 += 1;
    for (const skill of requiredSkills) {
      activeSkillVocabulary.add(normalize(skill));
    }
  }

  for (const activityId of effectiveActivityIds) {
    const activity = activityCache.get(activityId);
    const requiredSkills = Array.isArray(activity?.required_skills) ? activity.required_skills.filter(Boolean) : [];
    bump(effectiveSampleRequiredSkillsHistogram, String(requiredSkills.length));
  }

  const coreSkillSet = await readCoreSkillSet();
  const outOfCoreSkills = [...activeSkillVocabulary].filter((skill) => !coreSkillSet.has(skill));

  const { data: interactionEvents, error: interactionError } = await supabaseAdmin
    .from('rec_interaction_event')
    .select('event_type, serving_item_id, participation_id')
    .limit(50000);
  if (interactionError) {
    throw new Error(interactionError.message);
  }
  const interactionEventHistogram = new Map();
  let interactionWithServingItemId = 0;
  let interactionWithParticipationId = 0;
  for (const row of interactionEvents ?? []) {
    bump(interactionEventHistogram, normalize(row.event_type) || '(empty)');
    if (row.serving_item_id) interactionWithServingItemId += 1;
    if (row.participation_id) interactionWithParticipationId += 1;
  }

  const { data: servingItems, error: servingItemsError } = await supabaseAdmin
    .from('rec_serving_item')
    .select('id, scope, candidate_type')
    .limit(50000);
  if (servingItemsError) {
    throw new Error(servingItemsError.message);
  }
  const servingScopeHistogram = new Map();
  const servingCandidateTypeHistogram = new Map();
  for (const row of servingItems ?? []) {
    bump(servingScopeHistogram, normalize(row.scope) || '(empty)');
    bump(servingCandidateTypeHistogram, normalize(row.candidate_type) || '(empty)');
  }

  const { data: recommendationParts, error: recommendationPartsError } = await supabaseAdmin
    .from('activity_participations')
    .select('id, recommendation_item_id, registration_source, status')
    .eq('registration_source', 'recommendation')
    .limit(50000);
  if (recommendationPartsError) {
    throw new Error(recommendationPartsError.message);
  }
  let withRecommendationItemId = 0;
  const recommendationStatusHistogram = new Map();
  for (const row of recommendationParts ?? []) {
    if (row.recommendation_item_id) withRecommendationItemId += 1;
    bump(recommendationStatusHistogram, normalize(row.status) || '(empty)');
  }

  const summary = {
    activity_participations: {
      fetched_rows: fetchedRows.length,
      effective_samples: accepted,
      accepted_positive: acceptedPositive,
      accepted_negative: acceptedNegative,
      positive_ratio: accepted > 0 ? Number((acceptedPositive / accepted).toFixed(4)) : 0,
      negative_ratio: accepted > 0 ? Number((acceptedNegative / accepted).toFixed(4)) : 0,
      skipped: {
        skipped_unlabeled_status: skippedUnlabeledStatus,
        skipped_missing_activity_id: skippedMissingActivityId,
        skipped_missing_volunteer_id: skippedMissingVolunteerId,
        skipped_missing_activity_record: skippedMissingActivityRecord,
      },
      status_histogram_fetched: toSortedObjectFromMap(statusHistogramFetched),
      status_histogram_labeled: toSortedObjectFromMap(statusHistogramLabeled),
      status_histogram_accepted: toSortedObjectFromMap(statusHistogramAccepted),
    },
    volunteer_profiles: {
      effective_unique_volunteers: effectiveVolunteerIds.length,
      missing_profile: missingProfile,
      empty_skills: emptySkills,
      empty_interests: emptyInterests,
      empty_available_choices: emptyAvailableChoices,
      full_week_available_choices: fullWeekAvailability,
      total_hours_zero_or_invalid: totalHoursZeroOrInvalid,
      out_of_catalog_profiles_count: profileOutOfCatalogMap.size,
      out_of_catalog_interests_count: allOutOfCatalogProfileInterests.length,
      out_of_catalog_interests_preview: allOutOfCatalogProfileInterests.slice(0, 20),
    },
    seed_profiles: {
      seed_prefix: SEED_PREFIX,
      scanned_seed_volunteers: seedUserIds.length,
      out_of_catalog_profiles_count: seedOutOfCatalogMap.size,
      out_of_catalog_interests_count: allOutOfCatalogSeedInterests.length,
      out_of_catalog_interests_preview: allOutOfCatalogSeedInterests.slice(0, 20),
      out_of_catalog_profile_preview: Array.from(seedOutOfCatalogMap.values()).slice(0, 8),
    },
    interest_catalog: {
      selected_source: interestCatalog.selected_source,
      selected_count: interestCatalog.selected_count,
      sample_interests: interestCatalog.selected_catalog.slice(0, 12),
      fe_catalog: {
        found: interestCatalog.fe_catalog.found,
        count: interestCatalog.fe_catalog.interests.length,
        path: interestCatalog.fe_catalog.path,
      },
      db_catalog: {
        found: interestCatalog.db_catalog.found,
        count: interestCatalog.db_catalog.interests.length,
        column: interestCatalog.db_catalog.column,
      },
      fe_db_mismatch: {
        has_mismatch: interestCatalog.fe_db_mismatch.has_mismatch,
        only_in_fe_count: interestCatalog.fe_db_mismatch.only_in_fe.length,
        only_in_db_count: interestCatalog.fe_db_mismatch.only_in_db.length,
        only_in_fe_preview: interestCatalog.fe_db_mismatch.only_in_fe.slice(0, 20),
        only_in_db_preview: interestCatalog.fe_db_mismatch.only_in_db.slice(0, 20),
      },
    },
    activities: {
      active_published_count: (activeActivities ?? []).length,
      required_skills_empty: requiredSkillsEmpty,
      required_skills_one: requiredSkillsOne,
      required_skills_2_to_4: requiredSkills2To4,
      required_skills_gt4: requiredSkillsGt4,
      required_skills_histogram: toSortedObjectFromMap(requiredSkillsHistogram, true),
      effective_sample_required_skills_histogram: toSortedObjectFromMap(effectiveSampleRequiredSkillsHistogram, true),
      activity_skill_vocabulary_size: activeSkillVocabulary.size,
      core_skills_count: coreSkillSet.size,
      out_of_core_skills_count: outOfCoreSkills.length,
      out_of_core_skills_preview: outOfCoreSkills.slice(0, 20),
    },
    rec_interaction_event: {
      total_rows: (interactionEvents ?? []).length,
      event_histogram: toSortedObjectFromMap(interactionEventHistogram),
      rows_with_serving_item_id: interactionWithServingItemId,
      rows_with_participation_id: interactionWithParticipationId,
    },
    rec_serving_item: {
      total_rows: (servingItems ?? []).length,
      scope_histogram: toSortedObjectFromMap(servingScopeHistogram),
      candidate_type_histogram: toSortedObjectFromMap(servingCandidateTypeHistogram),
    },
    recommendation_participations_linkage: {
      registration_source_recommendation_rows: (recommendationParts ?? []).length,
      with_recommendation_item_id: withRecommendationItemId,
      without_recommendation_item_id: (recommendationParts ?? []).length - withRecommendationItemId,
      status_histogram: toSortedObjectFromMap(recommendationStatusHistogram),
    },
  };

  const verdict = computeVerdict(summary);
  console.log(JSON.stringify({ verdict, summary }, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[auditRecommendationMlReadiness] failed: ${message}`);
  process.exitCode = 1;
});
