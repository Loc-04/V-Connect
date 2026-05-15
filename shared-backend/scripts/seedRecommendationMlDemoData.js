import { supabaseAdmin } from '../src/database/supabase.js';
import { calculateActivityMatchForVolunteer } from '../src/recommendations/recommendations.service.js';
import { isUuid } from '../src/common/utils/validators.js';

const SEED_PREFIX = String(process.env.RECOMMENDATION_ML_SEED_PREFIX ?? 'ML Seed').trim() || 'ML Seed';
const SEED_NAMESPACE = String(process.env.RECOMMENDATION_ML_SEED_NAMESPACE ?? 'recommendation-ml-demo')
  .trim()
  .toLowerCase();
const SEED_EMAIL_DOMAIN =
  String(process.env.RECOMMENDATION_ML_SEED_EMAIL_DOMAIN ?? 'mlseed.local').trim().toLowerCase() || 'mlseed.local';
const SEED_PASSWORD = String(process.env.RECOMMENDATION_ML_SEED_PASSWORD ?? 'SeedPass!234').trim() || 'SeedPass!234';

const DRY_RUN = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.RECOMMENDATION_ML_SEED_DRY_RUN ?? 'true')
    .trim()
    .toLowerCase()
);
const RESET_SEED_DATA = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.RECOMMENDATION_ML_SEED_RESET ?? '')
    .trim()
    .toLowerCase()
);

const ORGANIZER_COUNT = Number(process.env.RECOMMENDATION_ML_SEED_ORGANIZER_COUNT ?? 8);
const VOLUNTEER_COUNT = Number(process.env.RECOMMENDATION_ML_SEED_VOLUNTEER_COUNT ?? 96);
const ACTIVITY_COUNT = Number(process.env.RECOMMENDATION_ML_SEED_ACTIVITY_COUNT ?? 30);
const TARGET_LABELED_SAMPLES = Number(process.env.RECOMMENDATION_ML_SEED_TARGET_SAMPLES ?? 420);
const SOURCE_SURFACE = String(process.env.RECOMMENDATION_ML_SEED_SOURCE_SURFACE ?? 'web-seed').trim() || 'web-seed';

const ACTIVITY_TEMPLATE = [
  {
    slug: 'tutoring',
    title: 'Community Tutoring Drive',
    cause: 'education',
    required_skills: ['Teaching', 'Public Speaking', 'Customer Service'],
    descriptionTokens: ['education', 'tutoring', 'youth'],
    session: 'aft',
  },
  {
    slug: 'health',
    title: 'Neighborhood Health Support',
    cause: 'health',
    required_skills: ['First Aid', 'Customer Service', 'Data Entry'],
    descriptionTokens: ['health', 'medical', 'wellness'],
    session: 'mor',
  },
  {
    slug: 'environment',
    title: 'Green Cleanup Campaign',
    cause: 'environment',
    required_skills: ['Cleaning', 'Gardening/Landscaping', 'Logistics'],
    descriptionTokens: ['environment', 'eco', 'clean-up'],
    session: 'mor',
  },
  {
    slug: 'fundraising',
    title: 'Local Fundraising Activation',
    cause: 'community',
    required_skills: ['Fundraising', 'Event Organization', 'Public Speaking'],
    descriptionTokens: ['fundraising', 'community', 'campaign'],
    session: 'eve',
  },
  {
    slug: 'operations',
    title: 'Volunteer Operations Hub',
    cause: 'operations',
    required_skills: ['Project Management', 'Logistics', 'Data Entry'],
    descriptionTokens: ['operations', 'support', 'coordination'],
    session: 'aft',
  },
  {
    slug: 'outreach',
    title: 'Family Outreach Day',
    cause: 'community',
    required_skills: ['Event Organization', 'Teaching', 'Customer Service'],
    descriptionTokens: ['outreach', 'family', 'engagement'],
    session: 'eve',
  },
  {
    slug: 'senior-care',
    title: 'Senior Care Companion Shift',
    cause: 'health',
    required_skills: ['First Aid', 'Customer Service', 'Public Speaking'],
    descriptionTokens: ['senior', 'care', 'wellbeing'],
    session: 'aft',
  },
  {
    slug: 'food-relief',
    title: 'Community Food Relief Distribution',
    cause: 'community',
    required_skills: ['Logistics', 'Cooking', 'Data Entry'],
    descriptionTokens: ['food', 'relief', 'distribution'],
    session: 'mor',
  },
  {
    slug: 'digital-literacy',
    title: 'Digital Literacy Workshop',
    cause: 'education',
    required_skills: ['Teaching', 'IT Support', 'Public Speaking'],
    descriptionTokens: ['digital', 'learning', 'workshop'],
    session: 'eve',
  },
  {
    slug: 'event-support',
    title: 'Community Event Support Team',
    cause: 'community',
    required_skills: ['Event Organization', 'Logistics', 'Customer Service'],
    descriptionTokens: ['event', 'community', 'support'],
    session: 'aft',
  },
  {
    slug: 'youth-sports',
    title: 'Youth Sports Mentoring',
    cause: 'education',
    required_skills: ['Teaching', 'Crowd Control', 'First Aid'],
    descriptionTokens: ['youth', 'sports', 'mentoring'],
    session: 'eve',
  },
  {
    slug: 'urban-green',
    title: 'Urban Garden Restoration',
    cause: 'environment',
    required_skills: ['Gardening/Landscaping', 'Cleaning', 'Project Management'],
    descriptionTokens: ['garden', 'environment', 'restoration'],
    session: 'mor',
  },
];

const HIGH_SKILL_POOL = [
  'First Aid',
  'Teaching',
  'Event Organization',
  'Logistics',
  'Project Management',
  'Fundraising',
  'Public Speaking',
  'Customer Service',
  'Gardening/Landscaping',
  'Crowd Control',
  'IT Support',
];

const MID_SKILL_POOL = [
  'Cleaning',
  'Data Entry',
  'Customer Service',
  'Event Organization',
  'Public Speaking',
  'Teaching',
  'Logistics',
  'Photography/Videography',
  'Graphic Design',
  'Copywriting',
  'Social Media Management',
];

const LOW_SKILL_POOL = [
  'Cooking',
  'Photography/Videography',
  'Graphic Design',
  'Data Entry',
  'Customer Service',
  'Cleaning',
  'Social Media Management',
  'Copywriting',
  'IT Support',
  'Driving',
];

const HIGH_INTEREST_POOL = ['education', 'health', 'environment', 'community', 'outreach', 'campaign'];
const MID_INTEREST_POOL = ['community', 'events', 'learning', 'environment', 'health', 'youth'];
const LOW_INTEREST_POOL = ['community', 'learning', 'events', 'environment'];

const SLOT_PATTERNS = [
  ['mon_mor', 'tue_mor', 'wed_mor', 'thu_aft', 'fri_aft', 'sat_mor'],
  ['mon_eve', 'tue_eve', 'wed_eve', 'thu_eve', 'fri_eve', 'sat_eve'],
  ['tue_aft', 'wed_aft', 'thu_aft', 'fri_mor', 'sat_aft', 'sun_aft'],
  ['mon_mor', 'mon_aft', 'wed_eve', 'fri_aft', 'sun_mor', 'sun_eve'],
  ['tue_mor', 'thu_mor', 'sat_mor', 'sat_aft', 'sun_mor', 'sun_aft'],
  ['mon_eve', 'wed_aft', 'fri_eve', 'sat_eve', 'sun_eve'],
  ['mon_aft', 'tue_eve', 'thu_eve', 'sat_aft', 'sun_aft'],
  ['wed_mor', 'thu_mor', 'fri_mor', 'sat_mor', 'sun_mor'],
];

function safePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.trunc(parsed));
}

function normalizeStatus(status) {
  return String(status ?? '')
    .trim()
    .toLowerCase();
}

function boolToLabel(value) {
  return value ? 'true' : 'false';
}

function fakeUuid(index) {
  const tail = String(index).padStart(12, '0').slice(-12);
  return `00000000-0000-4000-8000-${tail}`;
}

function pairKey(activityId, volunteerId) {
  return `${activityId}::${volunteerId}`;
}

function rotateArray(values, startIndex, take) {
  if (!Array.isArray(values) || values.length === 0 || take <= 0) {
    return [];
  }
  const output = [];
  for (let offset = 0; offset < take; offset += 1) {
    output.push(values[(startIndex + offset) % values.length]);
  }
  return output;
}

function unique(values) {
  return Array.from(new Set(values.map((item) => String(item ?? '').trim()).filter((item) => item.length > 0)));
}

function pickAvailabilityPattern(index, group) {
  const basePattern = SLOT_PATTERNS[index % SLOT_PATTERNS.length] ?? [];
  if (group === 'high') {
    return unique([
      ...basePattern,
      ...rotateArray(SLOT_PATTERNS[(index + 2) % SLOT_PATTERNS.length] ?? [], 0, 2),
      ...rotateArray(SLOT_PATTERNS[(index + 4) % SLOT_PATTERNS.length] ?? [], 0, 2),
    ]).slice(0, 12);
  }
  if (group === 'medium') {
    return unique([
      ...basePattern,
      ...rotateArray(SLOT_PATTERNS[(index + 3) % SLOT_PATTERNS.length] ?? [], 0, 2),
    ]).slice(0, 9);
  }
  return unique(basePattern.slice(0, 4));
}

function nextDayWithSession(dayIndexOffset, session) {
  const base = new Date();
  const event = new Date(base);
  // Use historical timestamps so seeded training data does not pollute live published recommendation candidates.
  event.setUTCDate(base.getUTCDate() - (45 - dayIndexOffset));
  if (session === 'mor') {
    event.setUTCHours(8, 30, 0, 0);
  } else if (session === 'aft') {
    event.setUTCHours(14, 0, 0, 0);
  } else {
    event.setUTCHours(18, 30, 0, 0);
  }
  const start = event.toISOString();
  const endDate = new Date(event);
  endDate.setUTCHours(endDate.getUTCHours() + 3);
  const end = endDate.toISOString();
  return { start, end };
}

function needsCheckedInAt(status) {
  return normalizeStatus(status) === 'checked_in';
}

function buildOrganizerSpecs(count) {
  const safeCount = safePositiveInt(count, 8);
  return Array.from({ length: safeCount }, (_, index) => {
    const ordinal = String(index + 1).padStart(2, '0');
    return {
      key: `organizer-${ordinal}`,
      role: 'organizer',
      full_name: `${SEED_PREFIX} Organizer ${ordinal}`,
      email: `mlseed.organizer.${ordinal}@${SEED_EMAIL_DOMAIN}`,
    };
  });
}

function buildVolunteerSpecs(count) {
  const safeCount = safePositiveInt(count, 96);
  const groupSize = Math.max(1, Math.floor(safeCount / 3));
  return Array.from({ length: safeCount }, (_, index) => {
    const ordinal = String(index + 1).padStart(3, '0');
    const group = index < groupSize ? 'high' : index < groupSize * 2 ? 'medium' : 'low';

    let skills;
    let interests;
    let availableChoices;
    let totalHours;
    if (group === 'high') {
      skills = unique([...rotateArray(HIGH_SKILL_POOL, index, 5), ...rotateArray(MID_SKILL_POOL, index, 1)]);
      interests = unique(rotateArray(HIGH_INTEREST_POOL, index, 3));
      availableChoices = pickAvailabilityPattern(index, group);
      totalHours = 64 + ((index * 9) % 72);
    } else if (group === 'medium') {
      skills = unique([...rotateArray(MID_SKILL_POOL, index, 4), ...rotateArray(HIGH_SKILL_POOL, index, 1)]);
      interests = unique(rotateArray(MID_INTEREST_POOL, index, 3));
      availableChoices = pickAvailabilityPattern(index, group);
      totalHours = 20 + ((index * 5) % 40);
    } else {
      skills = unique([...rotateArray(LOW_SKILL_POOL, index, 3), rotateArray(MID_SKILL_POOL, index, 1)[0]]).slice(0, 4);
      interests = unique(rotateArray(LOW_INTEREST_POOL, index, 2));
      availableChoices = pickAvailabilityPattern(index, group);
      totalHours = 4 + ((index * 3) % 16);
    }

    return {
      key: `volunteer-${ordinal}`,
      role: 'volunteer',
      group,
      full_name: `${SEED_PREFIX} Volunteer ${ordinal}`,
      email: `mlseed.volunteer.${ordinal}@${SEED_EMAIL_DOMAIN}`,
      profile: {
        skills,
        interests,
        available_choices: availableChoices,
        total_hours: totalHours,
      },
    };
  });
}

function buildActivitySpecs(count, organizers) {
  const safeCount = safePositiveInt(count, 30);
  return Array.from({ length: safeCount }, (_, index) => {
    const template = ACTIVITY_TEMPLATE[index % ACTIVITY_TEMPLATE.length];
    const organizer = organizers[index % organizers.length];
    const ordinal = String(index + 1).padStart(2, '0');
    const slot = nextDayWithSession(index, template.session);
    const expandedSkills = unique([
      ...template.required_skills,
      ...rotateArray(HIGH_SKILL_POOL, index * 2, 3),
    ]);
    const targetSkillCount = 2 + (index % 3); // 2..4 required skills/activity
    const requiredSkills = expandedSkills.slice(0, Math.min(4, Math.max(2, targetSkillCount)));
    const descriptionTokens = unique(template.descriptionTokens);
    return {
      key: `activity-${ordinal}`,
      title: `${SEED_PREFIX} Activity ${ordinal} - ${template.title}`,
      organizer_id: organizer.id,
      description:
        `${SEED_PREFIX} demo activity (${SEED_NAMESPACE}). ` +
        `Used for recommendation ML v1 seeding. Cause=${template.cause}. Focus: ${descriptionTokens.join(', ')}.`,
      location: {
        address: `${SEED_PREFIX} Hub ${ordinal}`,
        city: 'Ho Chi Minh City',
      },
      start_time: slot.start,
      end_time: slot.end,
      capacity: 80,
      required_skills: requiredSkills,
      status: 'completed',
    };
  });
}

async function fetchSeedUsersByPrefix() {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, role, full_name, status, deleted_at')
    .ilike('full_name', `${SEED_PREFIX} %`)
    .limit(5000);

  if (error) {
    throw new Error(`Failed to fetch seed users: ${error.message}`);
  }
  return Array.isArray(data) ? data : [];
}

async function fetchSeedActivitiesByPrefix() {
  const { data, error } = await supabaseAdmin
    .from('activities')
    .select('id, title, organizer_id, deleted_at')
    .ilike('title', `${SEED_PREFIX} Activity %`)
    .limit(5000);

  if (error) {
    throw new Error(`Failed to fetch seed activities: ${error.message}`);
  }
  return Array.isArray(data) ? data : [];
}

async function listAuthUsersByEmails(emailSet) {
  const wanted = new Set(Array.from(emailSet).map((email) => String(email).trim().toLowerCase()));
  const found = new Map();
  if (wanted.size === 0) {
    return found;
  }

  const perPage = 200;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Failed to list auth users: ${error.message}`);
    }

    const users = Array.isArray(data?.users) ? data.users : [];
    for (const user of users) {
      const email = String(user?.email ?? '').trim().toLowerCase();
      if (wanted.has(email)) {
        found.set(email, user);
      }
    }

    if (users.length < perPage || found.size === wanted.size) {
      break;
    }
  }

  return found;
}

async function ensureAuthUsers(userSpecs) {
  const emailSet = new Set(userSpecs.map((item) => item.email));
  const existingByEmail = await listAuthUsersByEmails(emailSet);

  const ensured = [];
  let dryRunIndex = 1;
  for (const spec of userSpecs) {
    const normalizedEmail = String(spec.email).trim().toLowerCase();
    const existing = existingByEmail.get(normalizedEmail);
    if (existing?.id) {
      ensured.push({
        ...spec,
        id: existing.id,
        created_auth_user: false,
      });
      continue;
    }

    if (DRY_RUN) {
      ensured.push({
        ...spec,
        id: fakeUuid(dryRunIndex),
        created_auth_user: false,
      });
      dryRunIndex += 1;
      continue;
    }

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: spec.email,
      password: SEED_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: spec.full_name,
        seed_namespace: SEED_NAMESPACE,
        seed_marker: SEED_PREFIX,
      },
      app_metadata: {
        seed_namespace: SEED_NAMESPACE,
      },
    });

    if (error) {
      throw new Error(`Failed to create auth user ${spec.email}: ${error.message}`);
    }

    const userId = data?.user?.id;
    if (!isUuid(userId)) {
      throw new Error(`Auth user created without valid uuid for ${spec.email}.`);
    }

    ensured.push({
      ...spec,
      id: userId,
      created_auth_user: true,
    });
  }

  return ensured;
}

async function upsertPublicUsers(userSpecs) {
  if (DRY_RUN) {
    return userSpecs.map((item) => ({
      ...item,
      created_public_user: false,
    }));
  }

  const now = new Date().toISOString();
  const rows = userSpecs.map((item) => ({
    id: item.id,
    role: item.role,
    full_name: item.full_name,
    phone: null,
    avatar_url: null,
    status: 'active',
    deleted_at: null,
    updated_at: now,
  }));

  const { error } = await supabaseAdmin.from('users').upsert(rows, { onConflict: 'id' });
  if (error) {
    throw new Error(`Failed to upsert public.users seed rows: ${error.message}`);
  }

  return userSpecs.map((item) => ({
    ...item,
    created_public_user: true,
  }));
}

async function upsertVolunteerProfiles(volunteers) {
  if (volunteers.length === 0) {
    return;
  }
  if (DRY_RUN) {
    return;
  }

  const now = new Date().toISOString();
  const rows = volunteers.map((item) => ({
    user_id: item.id,
    skills: item.profile.skills,
    interests: item.profile.interests,
    available_choices: item.profile.available_choices,
    total_hours: item.profile.total_hours,
    updated_at: now,
  }));

  const { error } = await supabaseAdmin.from('volunteer_profiles').upsert(rows, { onConflict: 'user_id' });
  if (error) {
    throw new Error(`Failed to upsert volunteer_profiles seed rows: ${error.message}`);
  }
}

async function ensureSeedActivities(specs) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('activities')
    .select('id, title, organizer_id, required_skills, status, deleted_at, start_time, end_time')
    .ilike('title', `${SEED_PREFIX} Activity %`)
    .limit(5000);

  if (existingError) {
    throw new Error(`Failed to read existing seed activities: ${existingError.message}`);
  }

  const existingByTitle = new Map((existing ?? []).map((row) => [String(row.title ?? '').trim(), row]));
  const now = new Date().toISOString();
  const upsertRows = specs.map((spec) => {
    const existingRow = existingByTitle.get(spec.title);
    return {
      ...(existingRow?.id ? { id: existingRow.id } : {}),
      title: spec.title,
      organizer_id: spec.organizer_id,
      description: spec.description,
      location: spec.location,
      start_time: spec.start_time,
      end_time: spec.end_time,
      capacity: spec.capacity,
      required_skills: spec.required_skills,
      status: spec.status,
      deleted_at: null,
      updated_at: now,
    };
  });

  if (!DRY_RUN) {
    const { error } = await supabaseAdmin.from('activities').upsert(upsertRows, { onConflict: 'id' });
    if (error) {
      throw new Error(`Failed to upsert activities seed rows: ${error.message}`);
    }
  }

  const { data: refreshed, error: refreshedError } = await supabaseAdmin
    .from('activities')
    .select('id, title, organizer_id, required_skills, status, deleted_at, start_time, end_time')
    .in('title', specs.map((item) => item.title))
    .limit(specs.length * 2);

  if (refreshedError) {
    throw new Error(`Failed to re-fetch seed activities: ${refreshedError.message}`);
  }

  const refreshedByTitle = new Map((refreshed ?? []).map((row) => [String(row.title ?? '').trim(), row]));
  return specs.map((spec, index) => {
    const row = refreshedByTitle.get(spec.title);
    if (row?.id) {
      return row;
    }
    return {
      id: fakeUuid(900000 + index),
      title: spec.title,
      organizer_id: spec.organizer_id,
      required_skills: spec.required_skills,
      status: spec.status,
      start_time: spec.start_time,
      end_time: spec.end_time,
    };
  });
}

function toRatio(value, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || !Number.isFinite(max) || max <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, numeric / max));
}

function pickFromPool(pool, targetCount, selectedVolunteerIds) {
  const output = [];
  for (const item of pool) {
    if (output.length >= targetCount) {
      break;
    }
    if (selectedVolunteerIds.has(item.volunteerId)) {
      continue;
    }
    selectedVolunteerIds.add(item.volunteerId);
    output.push(item);
  }
  return output;
}

function chooseFinalStatus(baseStatus, statusCounts, targetStatusCounts) {
  if (statusCounts[baseStatus] < targetStatusCounts[baseStatus]) {
    return baseStatus;
  }
  if (baseStatus === 'checked_in' || baseStatus === 'approved') {
    const fallback = statusCounts.approved < targetStatusCounts.approved ? 'approved' : 'checked_in';
    return statusCounts[fallback] < targetStatusCounts[fallback] ? fallback : baseStatus;
  }
  const fallback = statusCounts.rejected < targetStatusCounts.rejected ? 'rejected' : 'cancelled';
  return statusCounts[fallback] < targetStatusCounts[fallback] ? fallback : baseStatus;
}

function trimPlannedRows(rows, targetCount, statusCounts, targetStatusCounts) {
  if (rows.length <= targetCount) {
    return rows;
  }

  const removableOrder = ['approved', 'checked_in', 'cancelled', 'rejected'];
  const trimmed = [...rows];
  while (trimmed.length > targetCount) {
    let removed = false;
    for (const status of removableOrder) {
      const hasBuffer = statusCounts[status] > targetStatusCounts[status];
      if (!hasBuffer) {
        continue;
      }
      const idx = trimmed.findLastIndex((row) => row.status === status);
      if (idx < 0) {
        continue;
      }
      trimmed.splice(idx, 1);
      statusCounts[status] -= 1;
      removed = true;
      break;
    }
    if (!removed) {
      trimmed.pop();
    }
  }
  return trimmed;
}

async function planPairsAndStatuses(seedActivities, volunteers, targetSamples) {
  const safeTarget = safePositiveInt(targetSamples, 420);
  const planned = [];
  const statusCounts = {
    checked_in: 0,
    approved: 0,
    rejected: 0,
    cancelled: 0,
  };
  const targetStatusCounts = {
    checked_in: Math.floor(safeTarget * 0.28),
    approved: Math.floor(safeTarget * 0.27),
    rejected: Math.floor(safeTarget * 0.25),
    cancelled: safeTarget - Math.floor(safeTarget * 0.28) - Math.floor(safeTarget * 0.27) - Math.floor(safeTarget * 0.25),
  };

  const perActivityLimit = Math.max(10, Math.ceil(safeTarget / Math.max(seedActivities.length, 1)));
  const positivePerActivity = Math.max(5, Math.floor(perActivityLimit * 0.55));
  const checkedInPerActivity = Math.max(2, Math.floor(positivePerActivity * 0.55));
  const approvedPerActivity = Math.max(1, positivePerActivity - checkedInPerActivity);
  const rejectedPerActivity = Math.max(2, Math.floor((perActivityLimit - positivePerActivity) * 0.55));
  const cancelledPerActivity = Math.max(1, perActivityLimit - positivePerActivity - rejectedPerActivity);
  let totalPairsConsidered = 0;
  let scorerFailCount = 0;
  let scoredPairsCount = 0;
  let zeroScorePairsCount = 0;
  let availabilityOnlyNegativePairs = 0;

  for (const activity of seedActivities) {
    const scored = [];
    for (const volunteer of volunteers) {
      totalPairsConsidered += 1;
      try {
        const result = await calculateActivityMatchForVolunteer({
          activity,
          volunteerId: volunteer.id,
        });
        scoredPairsCount += 1;
        if (Number(result?.matchScore ?? 0) <= 0) {
          zeroScorePairsCount += 1;
        }

        const scoreBreakdown = result?.score_breakdown ?? {};
        const skillRatio = toRatio(scoreBreakdown.skill_score, 50);
        const interestRatio = toRatio(scoreBreakdown.interest_score, 20);
        const availabilityRatio = toRatio(scoreBreakdown.availability_score, 15);
        const experienceRatio = toRatio(scoreBreakdown.experience_score, 10);
        const historyRatio = toRatio(scoreBreakdown.history_score, 5);
        const blendedQuality =
          skillRatio * 0.5 +
          interestRatio * 0.2 +
          availabilityRatio * 0.18 +
          experienceRatio * 0.08 +
          historyRatio * 0.04;
        const availabilityOnlyMismatch = availabilityRatio >= 0.45 && skillRatio < 0.15;

        if (availabilityOnlyMismatch) {
          availabilityOnlyNegativePairs += 1;
        }

        scored.push({
          volunteerId: volunteer.id,
          matchScore: Number(result?.matchScore ?? 0),
          matchRatio: Number(result?.matchRatio ?? 0),
          group: volunteer.group,
          skillRatio,
          interestRatio,
          availabilityRatio,
          experienceRatio,
          historyRatio,
          blendedQuality,
          availabilityOnlyMismatch,
        });
      } catch {
        scorerFailCount += 1;
      }
    }

    scored.sort(
      (a, b) =>
        b.blendedQuality - a.blendedQuality ||
        b.skillRatio - a.skillRatio ||
        b.interestRatio - a.interestRatio ||
        b.matchScore - a.matchScore
    );

    const selectedVolunteerIds = new Set();
    const highSignalPool = scored.filter((pair) => pair.skillRatio >= 0.35 && pair.blendedQuality >= 0.42);
    const mediumSignalPool = scored.filter((pair) => pair.skillRatio >= 0.2 && pair.blendedQuality >= 0.3);
    const lowSignalPool = [...scored].reverse();
    const mismatchPool = scored
      .filter(
        (pair) =>
          pair.availabilityOnlyMismatch ||
          (pair.skillRatio < 0.12 && pair.interestRatio < 0.15) ||
          pair.blendedQuality < 0.24
      )
      .sort((a, b) => a.blendedQuality - b.blendedQuality);

    const checkedInRows = pickFromPool(
      [...highSignalPool, ...mediumSignalPool, ...scored],
      checkedInPerActivity,
      selectedVolunteerIds
    );
    const approvedRows = pickFromPool(
      [...mediumSignalPool, ...highSignalPool, ...scored],
      approvedPerActivity,
      selectedVolunteerIds
    );
    const rejectedRows = pickFromPool(
      [...mismatchPool, ...lowSignalPool],
      rejectedPerActivity,
      selectedVolunteerIds
    );
    const cancelledRows = pickFromPool(
      [...lowSignalPool, ...mismatchPool],
      cancelledPerActivity,
      selectedVolunteerIds
    );

    const activityPlan = [
      ...checkedInRows.map((pair) => ({ pair, status: 'checked_in' })),
      ...approvedRows.map((pair) => ({ pair, status: 'approved' })),
      ...rejectedRows.map((pair) => ({ pair, status: 'rejected' })),
      ...cancelledRows.map((pair) => ({ pair, status: 'cancelled' })),
    ];

    for (const item of activityPlan) {
      if (planned.length >= safeTarget) {
        break;
      }
      const finalStatus = chooseFinalStatus(item.status, statusCounts, targetStatusCounts);
      statusCounts[finalStatus] += 1;
      planned.push({
        activityId: activity.id,
        volunteerId: item.pair.volunteerId,
        status: finalStatus,
        aiMatchScore: Number.isFinite(item.pair.matchRatio) ? item.pair.matchRatio : null,
        matchScore100: Number.isFinite(item.pair.matchScore) ? item.pair.matchScore : null,
      });
    }
  }

  const trimmed = trimPlannedRows(planned, safeTarget, statusCounts, targetStatusCounts);
  return {
    plannedRows: trimmed,
    planningStats: {
      total_pairs_considered: totalPairsConsidered,
      scorer_fail_count: scorerFailCount,
      scored_pairs_count: scoredPairsCount,
      zero_score_pairs_count: zeroScorePairsCount,
      availability_only_negative_pairs: availabilityOnlyNegativePairs,
      selected_pairs_before_cap: planned.length,
      selected_pairs_after_cap: trimmed.length,
      status_counts: statusCounts,
      status_targets: targetStatusCounts,
    },
  };
}

async function readExistingSeedParticipations(seedActivityIds, seedVolunteerIds) {
  if (seedActivityIds.length === 0 || seedVolunteerIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from('activity_participations')
    .select('id, activity_id, volunteer_id, status, ai_match_score, checked_in_at, recommendation_item_id, registration_source')
    .in('activity_id', seedActivityIds)
    .in('volunteer_id', seedVolunteerIds)
    .order('created_at', { ascending: false })
    .limit(seedActivityIds.length * seedVolunteerIds.length);

  if (error) {
    throw new Error(`Failed to read existing seed participations: ${error.message}`);
  }

  return Array.isArray(data) ? data : [];
}

function buildParticipationActions(plannedRows, existingRows) {
  const latestByPair = new Map();
  for (const row of existingRows) {
    const key = pairKey(row.activity_id, row.volunteer_id);
    if (!latestByPair.has(key)) {
      latestByPair.set(key, row);
    }
  }

  return plannedRows.map((planned, actionIndex) => {
    const key = pairKey(planned.activityId, planned.volunteerId);
    const existing = latestByPair.get(key) ?? null;
    if (!existing) {
      return { actionIndex, type: 'insert', planned, existing: null };
    }

    const statusEqual = normalizeStatus(existing.status) === normalizeStatus(planned.status);
    const sourceEqual = normalizeStatus(existing.registration_source) === 'recommendation';
    const currentScore = Number(existing.ai_match_score);
    const nextScore = Number(planned.aiMatchScore);
    const scoreEqual =
      Number.isFinite(currentScore) && Number.isFinite(nextScore)
        ? Math.abs(currentScore - nextScore) < 0.0005
        : currentScore === nextScore;
    const checkInConsistency = normalizeStatus(planned.status) !== 'checked_in' || Boolean(existing.checked_in_at);

    if (statusEqual && sourceEqual && scoreEqual && checkInConsistency) {
      return { actionIndex, type: 'skip', planned, existing };
    }

    return { actionIndex, type: 'update', planned, existing };
  });
}

async function insertServingItems(actions, seedActivitiesById) {
  const actionable = actions.filter((item) => item.type !== 'skip');
  if (actionable.length === 0) {
    return [];
  }

  const rows = actionable.map((action, index) => {
    const activity = seedActivitiesById.get(action.planned.activityId);
    return {
      scope: 'volunteer_to_activity',
      requester_user_id: action.planned.volunteerId,
      target_user_id: action.planned.volunteerId,
      target_activity_id: null,
      candidate_type: 'activity',
      candidate_activity_id: action.planned.activityId,
      candidate_volunteer_id: null,
      rank_position: (index % 15) + 1,
      predicted_score: Math.max(0, Math.min(100, Number(action.planned.matchScore100 ?? 0))),
      model_version: 'ml-seed-heuristic-baseline',
      provider: 'internal',
      feature_snapshot: {
        seeded: true,
        seed_namespace: SEED_NAMESPACE,
      },
      prediction_snapshot: {
        seeded: true,
        seed_namespace: SEED_NAMESPACE,
        activity_title: activity?.title ?? null,
        seed_action: action.type,
      },
    };
  });

  if (DRY_RUN) {
    return actionable.map((action, index) => ({
      actionIndex: action.actionIndex,
      id: fakeUuid(700000 + index),
    }));
  }

  const { data, error } = await supabaseAdmin.from('rec_serving_item').insert(rows).select('id');
  if (error) {
    throw new Error(`Failed to insert rec_serving_item seed rows: ${error.message}`);
  }

  const inserted = Array.isArray(data) ? data : [];
  return actionable.map((action, index) => ({
    actionIndex: action.actionIndex,
    id: inserted[index]?.id ?? null,
  }));
}

function buildInteractionEvents({ action, participationId, servingItemId, organizerActorId }) {
  // Fallback to volunteer if organizer side actor is unexpectedly missing for a seeded activity.
  const actorOrganizer = organizerActorId || action.planned.volunteerId;
  const events = [
    {
      event_type: 'detail_open',
      serving_item_id: servingItemId,
      actor_user_id: action.planned.volunteerId,
      activity_id: action.planned.activityId,
      volunteer_id: action.planned.volunteerId,
      participation_id: participationId,
      source_surface: SOURCE_SURFACE,
      metadata: { seeded: true, seed_namespace: SEED_NAMESPACE, stage: 'detail_open' },
    },
    {
      event_type: 'register',
      serving_item_id: servingItemId,
      actor_user_id: action.planned.volunteerId,
      activity_id: action.planned.activityId,
      volunteer_id: action.planned.volunteerId,
      participation_id: participationId,
      source_surface: SOURCE_SURFACE,
      metadata: { seeded: true, seed_namespace: SEED_NAMESPACE, stage: 'register' },
    },
  ];

  const finalStatus = normalizeStatus(action.planned.status);
  if (finalStatus === 'checked_in') {
    events.push({
      event_type: 'approved',
      serving_item_id: servingItemId,
      actor_user_id: actorOrganizer,
      activity_id: action.planned.activityId,
      volunteer_id: action.planned.volunteerId,
      participation_id: participationId,
      source_surface: SOURCE_SURFACE,
      metadata: { seeded: true, seed_namespace: SEED_NAMESPACE, stage: 'approved-before-checkin' },
    });
    events.push({
      event_type: 'checked_in',
      serving_item_id: servingItemId,
      actor_user_id: actorOrganizer,
      activity_id: action.planned.activityId,
      volunteer_id: action.planned.volunteerId,
      participation_id: participationId,
      source_surface: SOURCE_SURFACE,
      metadata: { seeded: true, seed_namespace: SEED_NAMESPACE, stage: 'checked_in' },
    });
    return events;
  }

  // For cancelled in this seed script we model volunteer self-cancel.
  const finalActor = finalStatus === 'cancelled' ? action.planned.volunteerId : actorOrganizer;
  events.push({
    event_type: finalStatus,
    serving_item_id: servingItemId,
    actor_user_id: finalActor,
    activity_id: action.planned.activityId,
    volunteer_id: action.planned.volunteerId,
    participation_id: participationId,
    source_surface: SOURCE_SURFACE,
    metadata: { seeded: true, seed_namespace: SEED_NAMESPACE, stage: 'final_status' },
  });
  return events;
}

async function applyParticipationActions(actions, servingByActionIndex, organizerByActivityId) {
  const updates = [];
  const inserts = [];
  const interactionEvents = [];
  const skippedCount = actions.filter((item) => item.type === 'skip').length;

  for (const action of actions) {
    if (action.type === 'skip') {
      continue;
    }
    const now = new Date().toISOString();
    const checkedInAt = needsCheckedInAt(action.planned.status) ? now : null;
    const servingItemId = servingByActionIndex.get(action.actionIndex) ?? null;

    if (action.type === 'update' && action.existing) {
      updates.push({
        id: action.existing.id,
        status: action.planned.status,
        ai_match_score: Number.isFinite(action.planned.aiMatchScore) ? action.planned.aiMatchScore : null,
        checked_in_at: checkedInAt,
        recommendation_item_id: servingItemId,
        registration_source: 'recommendation',
        updated_at: now,
      });
      interactionEvents.push(...buildInteractionEvents({
        action,
        participationId: action.existing.id,
        servingItemId,
        organizerActorId: organizerByActivityId.get(action.planned.activityId) ?? null,
      }));
      continue;
    }

    if (action.type === 'insert') {
      inserts.push({
        action,
        row: {
          activity_id: action.planned.activityId,
          volunteer_id: action.planned.volunteerId,
          status: action.planned.status,
          ai_match_score: Number.isFinite(action.planned.aiMatchScore) ? action.planned.aiMatchScore : null,
          checked_in_at: checkedInAt,
          recommendation_item_id: servingItemId,
          registration_source: 'recommendation',
          updated_at: now,
        },
      });
    }
  }

  if (DRY_RUN) {
    return {
      insertedCount: inserts.length,
      updatedCount: updates.length,
      skippedCount,
      interactionsCount: interactionEvents.length + inserts.length * 3,
    };
  }

  if (updates.length > 0) {
    for (const row of updates) {
      const { error } = await supabaseAdmin
        .from('activity_participations')
        .update({
          status: row.status,
          ai_match_score: row.ai_match_score,
          checked_in_at: row.checked_in_at,
          recommendation_item_id: row.recommendation_item_id,
          registration_source: row.registration_source,
          updated_at: row.updated_at,
        })
        .eq('id', row.id);
      if (error) {
        throw new Error(`Failed to update participation ${row.id}: ${error.message}`);
      }
    }
  }

  if (inserts.length > 0) {
    const { data, error } = await supabaseAdmin
      .from('activity_participations')
      .insert(inserts.map((item) => item.row))
      .select('id, recommendation_item_id');
    if (error) {
      throw new Error(`Failed to insert seed participations: ${error.message}`);
    }

    const insertedRows = Array.isArray(data) ? data : [];
    insertedRows.forEach((insertedRow, index) => {
      const payload = inserts[index];
      if (!payload) {
        return;
      }
      interactionEvents.push(
        ...buildInteractionEvents({
          action: payload.action,
          participationId: insertedRow.id,
          servingItemId: insertedRow.recommendation_item_id ?? payload.row.recommendation_item_id ?? null,
          organizerActorId: organizerByActivityId.get(payload.action.planned.activityId) ?? null,
        })
      );
    });
  }

  if (interactionEvents.length > 0) {
    const { error } = await supabaseAdmin.from('rec_interaction_event').insert(interactionEvents);
    if (error) {
      throw new Error(`Failed to insert rec_interaction_event seed rows: ${error.message}`);
    }
  }

  return {
    insertedCount: inserts.length,
    updatedCount: updates.length,
    skippedCount,
    interactionsCount: interactionEvents.length,
  };
}

async function resetSeedData() {
  const seedUsers = await fetchSeedUsersByPrefix();
  const seedActivities = await fetchSeedActivitiesByPrefix();
  const seedUserIds = seedUsers.map((row) => row.id).filter((id) => isUuid(id));
  const seedVolunteerIds = seedUsers
    .filter((row) => normalizeStatus(row.role) === 'volunteer')
    .map((row) => row.id)
    .filter((id) => isUuid(id));
  const seedActivityIds = seedActivities.map((row) => row.id).filter((id) => isUuid(id));

  if (DRY_RUN) {
    console.log(
      `[seedRecommendationMlDemoData] reset dry_run summary users=${seedUserIds.length}, activities=${seedActivityIds.length}`
    );
    return;
  }

  if (seedActivityIds.length > 0 || seedVolunteerIds.length > 0 || seedUserIds.length > 0) {
    const { error: interactionError } = await supabaseAdmin
      .from('rec_interaction_event')
      .delete()
      .eq('source_surface', SOURCE_SURFACE);
    if (interactionError) {
      throw new Error(`Failed to delete seed rec_interaction_event: ${interactionError.message}`);
    }
  }

  if (seedVolunteerIds.length > 0) {
    const { error: profileError } = await supabaseAdmin
      .from('volunteer_profiles')
      .delete()
      .in('user_id', seedVolunteerIds);
    if (profileError) {
      throw new Error(`Failed to delete seed volunteer_profiles: ${profileError.message}`);
    }
  }

  if (seedActivityIds.length > 0) {
    const { error: participationByActivityError } = await supabaseAdmin
      .from('activity_participations')
      .delete()
      .in('activity_id', seedActivityIds);
    if (participationByActivityError) {
      throw new Error(`Failed to delete seed participations by activity: ${participationByActivityError.message}`);
    }
  }

  if (seedVolunteerIds.length > 0) {
    const { error: participationByVolunteerError } = await supabaseAdmin
      .from('activity_participations')
      .delete()
      .in('volunteer_id', seedVolunteerIds);
    if (participationByVolunteerError) {
      throw new Error(`Failed to delete seed participations by volunteer: ${participationByVolunteerError.message}`);
    }
  }

  if (seedActivityIds.length > 0) {
    const { error: servingByActivityError } = await supabaseAdmin
      .from('rec_serving_item')
      .delete()
      .in('candidate_activity_id', seedActivityIds);
    if (servingByActivityError) {
      throw new Error(`Failed to delete seed rec_serving_item by candidate_activity_id: ${servingByActivityError.message}`);
    }
  }

  if (seedUserIds.length > 0) {
    const { error: servingByRequesterError } = await supabaseAdmin
      .from('rec_serving_item')
      .delete()
      .in('requester_user_id', seedUserIds);
    if (servingByRequesterError) {
      throw new Error(`Failed to delete seed rec_serving_item by requester_user_id: ${servingByRequesterError.message}`);
    }
  }

  if (seedActivityIds.length > 0) {
    const { error: activitiesError } = await supabaseAdmin.from('activities').delete().in('id', seedActivityIds);
    if (activitiesError) {
      throw new Error(`Failed to delete seed activities: ${activitiesError.message}`);
    }
  }

  if (seedUserIds.length > 0) {
    const { error: usersError } = await supabaseAdmin.from('users').delete().in('id', seedUserIds);
    if (usersError) {
      throw new Error(`Failed to delete seed public.users: ${usersError.message}`);
    }
  }

  for (const userId of seedUserIds) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId, false);
    if (error) {
      throw new Error(`Failed to delete seed auth user ${userId}: ${error.message}`);
    }
  }

  console.log(
    `[seedRecommendationMlDemoData] reset complete users=${seedUserIds.length}, volunteers=${seedVolunteerIds.length}, activities=${seedActivityIds.length}`
  );
}

async function seedClosedDataset() {
  const organizerCount = safePositiveInt(ORGANIZER_COUNT, 8);
  const volunteerCount = safePositiveInt(VOLUNTEER_COUNT, 96);
  const activityCount = safePositiveInt(ACTIVITY_COUNT, 30);
  const targetSamples = safePositiveInt(TARGET_LABELED_SAMPLES, 420);

  const organizerSpecs = buildOrganizerSpecs(organizerCount);
  const volunteerSpecs = buildVolunteerSpecs(volunteerCount);
  const userSpecs = [...organizerSpecs, ...volunteerSpecs];

  const authUsers = await ensureAuthUsers(userSpecs);
  const publicUsers = await upsertPublicUsers(authUsers);

  const organizerUsers = publicUsers.filter((row) => row.role === 'organizer');
  const volunteerUsers = publicUsers.filter((row) => row.role === 'volunteer');
  const volunteerByKey = new Map(volunteerUsers.map((row) => [row.key, row]));
  const enrichedVolunteers = volunteerSpecs
    .map((spec) => {
      const user = volunteerByKey.get(spec.key);
      if (!user) {
        return null;
      }
      return {
        ...user,
        group: spec.group,
        profile: spec.profile,
      };
    })
    .filter(Boolean);

  await upsertVolunteerProfiles(enrichedVolunteers);

  const activitySpecs = buildActivitySpecs(activityCount, organizerUsers);
  const seedActivities = await ensureSeedActivities(activitySpecs);
  const seedActivitiesById = new Map(seedActivities.map((row) => [row.id, row]));

  const { plannedRows, planningStats } = await planPairsAndStatuses(seedActivities, enrichedVolunteers, targetSamples);
  const seedActivityIds = seedActivities.map((row) => row.id).filter((id) => isUuid(id));
  const seedVolunteerIds = enrichedVolunteers.map((row) => row.id).filter((id) => isUuid(id));
  const existingRows = await readExistingSeedParticipations(seedActivityIds, seedVolunteerIds);
  const actions = buildParticipationActions(plannedRows, existingRows);
  const servingRows = await insertServingItems(actions, seedActivitiesById);
  const servingByActionIndex = new Map(servingRows.map((row) => [row.actionIndex, row.id]));
  const organizerByActivityId = new Map(
    seedActivities
      .filter((row) => isUuid(row.id) && isUuid(row.organizer_id))
      .map((row) => [row.id, row.organizer_id])
  );

  const participationResult = await applyParticipationActions(actions, servingByActionIndex, organizerByActivityId);

  const statusDistribution = plannedRows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, { checked_in: 0, approved: 0, rejected: 0, cancelled: 0 });

  console.log('[seedRecommendationMlDemoData] summary_begin');
  console.log(`[seedRecommendationMlDemoData] dry_run=${boolToLabel(DRY_RUN)} reset=${boolToLabel(RESET_SEED_DATA)}`);
  console.log(`[seedRecommendationMlDemoData] organizers_count=${organizerUsers.length}`);
  console.log(`[seedRecommendationMlDemoData] volunteers_count=${enrichedVolunteers.length}`);
  console.log(`[seedRecommendationMlDemoData] activities_count=${seedActivities.length}`);
  console.log(
    `[seedRecommendationMlDemoData] participations_inserted=${participationResult.insertedCount} ` +
      `participations_updated=${participationResult.updatedCount} participations_skipped=${participationResult.skippedCount}`
  );
  console.log(`[seedRecommendationMlDemoData] rec_serving_item_inserted=${servingRows.length}`);
  console.log(`[seedRecommendationMlDemoData] rec_interaction_event_inserted=${participationResult.interactionsCount}`);
  console.log(
    `[seedRecommendationMlDemoData] labels_checked_in=${statusDistribution.checked_in} ` +
      `labels_approved=${statusDistribution.approved} labels_rejected=${statusDistribution.rejected} ` +
      `labels_cancelled=${statusDistribution.cancelled}`
  );
  console.log(
    `[seedRecommendationMlDemoData] scorer_pairs_considered=${planningStats.total_pairs_considered} ` +
      `scorer_pairs_scored=${planningStats.scored_pairs_count} scorer_pairs_failed=${planningStats.scorer_fail_count} ` +
      `scorer_pairs_zero_score=${planningStats.zero_score_pairs_count}`
  );
  console.log(
    `[seedRecommendationMlDemoData] planned_pairs_before_cap=${planningStats.selected_pairs_before_cap} ` +
      `planned_pairs_after_cap=${planningStats.selected_pairs_after_cap}`
  );
  console.log('[seedRecommendationMlDemoData] summary_end');
}

async function main() {
  console.log(
    `[seedRecommendationMlDemoData] start namespace="${SEED_NAMESPACE}" prefix="${SEED_PREFIX}" dry_run=${boolToLabel(
      DRY_RUN
    )} reset=${boolToLabel(RESET_SEED_DATA)}`
  );

  if (RESET_SEED_DATA) {
    await resetSeedData();
    if (String(process.env.RECOMMENDATION_ML_SEED_RESET_ONLY ?? '').trim().toLowerCase() === 'true') {
      console.log('[seedRecommendationMlDemoData] reset-only mode done.');
      return;
    }
  }

  await seedClosedDataset();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[seedRecommendationMlDemoData] failed: ${message}`);
  process.exitCode = 1;
});
