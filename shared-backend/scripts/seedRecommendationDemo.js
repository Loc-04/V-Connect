import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) / SUPABASE_SERVICE_ROLE_KEY in shared-backend/.env');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_ACTIVITY_TEMPLATES = [
  {
    title: 'Football Festival Support',
    description:
      'Help coordinate a youth football festival, guide participants, and support check-in flow for community teams.',
    location: {
      address: 'Gia Dinh Youth Ground',
      city: 'Ho Chi Minh City',
      lat: 10.8039,
      lng: 106.6863,
    },
    requiredSkills: ['teamwork', 'softskill'],
    dayOfWeek: 6,
    startHour: 8,
    durationHours: 4,
    capacity: 24,
  },
  {
    title: 'Gaming For Good Night',
    description:
      'Support a charity gaming event, welcome guests, manage teamwork-based mini games, and keep the play video-games booth organized.',
    location: {
      address: 'District 1 Youth Hub',
      city: 'Ho Chi Minh City',
      lat: 10.7756,
      lng: 106.7009,
    },
    requiredSkills: ['softskill', 'teamwork'],
    dayOfWeek: 0,
    startHour: 18,
    durationHours: 3,
    capacity: 18,
  },
  {
    title: 'Community Match Day Coordination',
    description:
      'Coordinate volunteer stations, support football spectators, and keep communication smooth across the community match day.',
    location: {
      address: 'Thao Dien Riverside Park',
      city: 'Ho Chi Minh City',
      lat: 10.8016,
      lng: 106.731,
    },
    requiredSkills: ['teamwork', 'coordination'],
    dayOfWeek: 3,
    startHour: 17,
    durationHours: 3,
    capacity: 20,
  },
];

function getArgValue(flag) {
  const prefix = `--${flag}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : '';
}

async function findUserByRole(role) {
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, role')
    .eq('role', role)
    .is('deleted_at', null)
    .eq('status', 'active')
    .order('full_name')
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to lookup ${role} user: ${error.message}`);
  }

  return data ?? null;
}

async function resolveUserId(role, override) {
  if (override) {
    return override;
  }

  const user = await findUserByRole(role);
  if (!user) {
    throw new Error(`No active user found with role "${role}". Provide --${role}=<USER_ID>.`);
  }

  return user.id;
}

function uniqueStrings(values) {
  const seen = new Map();
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, normalized);
    }
  }
  return Array.from(seen.values());
}

function nextOccurrence(dayOfWeek, startHour) {
  const now = new Date();
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  start.setHours(startHour, 0, 0, 0);

  const currentDay = start.getDay();
  let daysAhead = (dayOfWeek - currentDay + 7) % 7;
  if (daysAhead === 0 && start <= now) {
    daysAhead = 7;
  }

  start.setDate(start.getDate() + daysAhead);
  return start;
}

function buildTimeWindow(dayOfWeek, startHour, durationHours) {
  const start = nextOccurrence(dayOfWeek, startHour);
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
}

async function ensureVolunteerProfile(volunteerId) {
  const { data: existing, error } = await supabase
    .from('volunteer_profiles')
    .select('user_id, skills, interests, availability, total_hours, availability_note')
    .eq('user_id', volunteerId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to lookup volunteer profile: ${error.message}`);
  }

  const nextPayload = {
    user_id: volunteerId,
    skills: uniqueStrings([...(existing?.skills ?? []), 'Teamwork', 'Softskill']),
    interests: uniqueStrings([...(existing?.interests ?? []), 'Football', 'Play video-games']),
    availability: {
      weekdays: Boolean(existing?.availability?.weekdays),
      weekends: true,
      evenings: true,
    },
    total_hours: Math.max(Number(existing?.total_hours ?? 0), 18),
    availability_note:
      existing?.availability_note ?? 'Available on weekends and evening community sessions for Sprint 3 demo.',
  };

  const { error: upsertError } = await supabase.from('volunteer_profiles').upsert(nextPayload, {
    onConflict: 'user_id',
  });

  if (upsertError) {
    throw new Error(`Failed to upsert volunteer profile: ${upsertError.message}`);
  }

  return nextPayload;
}

async function upsertDemoActivity(organizerId, template) {
  const candidateTitles = uniqueStrings([template.title, `Recommendation Demo - ${template.title}`]);
  const { data: existing, error: lookupError } = await supabase
    .from('activities')
    .select('id, title')
    .eq('organizer_id', organizerId)
    .in('title', candidateTitles)
    .is('deleted_at', null)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Failed to lookup demo activity "${template.title}": ${lookupError.message}`);
  }

  const { startTime, endTime } = buildTimeWindow(template.dayOfWeek, template.startHour, template.durationHours);
  const now = new Date().toISOString();
  const payload = {
    organizer_id: organizerId,
    title: template.title,
    description: template.description,
    location: template.location,
    start_time: startTime,
    end_time: endTime,
    capacity: template.capacity,
    required_skills: template.requiredSkills,
    status: 'published',
    updated_at: now,
  };

  if (existing) {
    const { data, error: updateError } = await supabase
      .from('activities')
      .update(payload)
      .eq('id', existing.id)
      .select('id, title, start_time, end_time, status')
      .maybeSingle();

    if (updateError) {
      throw new Error(`Failed to update demo activity "${template.title}": ${updateError.message}`);
    }

    return { activity: data, created: false };
  }

  const { data, error: insertError } = await supabase
    .from('activities')
    .insert({
      ...payload,
      created_at: now,
    })
    .select('id, title, start_time, end_time, status')
    .maybeSingle();

  if (insertError) {
    throw new Error(`Failed to create demo activity "${template.title}": ${insertError.message}`);
  }

  return { activity: data, created: true };
}

async function clearVolunteerRegistrations(volunteerId, activityIds) {
  if (activityIds.length === 0) {
    return 0;
  }

  const { data: existing, error: lookupError } = await supabase
    .from('activity_participations')
    .select('id')
    .eq('volunteer_id', volunteerId)
    .in('activity_id', activityIds);

  if (lookupError) {
    throw new Error(`Failed to lookup demo registrations: ${lookupError.message}`);
  }

  const participationIds = (existing ?? []).map((row) => row.id).filter(Boolean);
  if (participationIds.length === 0) {
    return 0;
  }

  const { error: deleteError } = await supabase.from('activity_participations').delete().in('id', participationIds);
  if (deleteError) {
    throw new Error(`Failed to clear demo registrations: ${deleteError.message}`);
  }

  return participationIds.length;
}

async function ensureNotification({ userId, title, message, type = 'message', data = {} }) {
  const { data: existing, error: lookupError } = await supabase
    .from('notifications')
    .select('id, title')
    .eq('user_id', userId)
    .eq('title', title)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Failed to lookup notification "${title}": ${lookupError.message}`);
  }

  if (existing) {
    return { notification: existing, created: false };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      title,
      message,
      type,
      data,
      created_at: new Date().toISOString(),
    })
    .select('id, title')
    .maybeSingle();

  if (insertError) {
    throw new Error(`Failed to create notification "${title}": ${insertError.message}`);
  }

  return { notification: inserted, created: true };
}

async function run() {
  const organizerOverride = getArgValue('organizer') || process.env.RECOMMENDATION_DEMO_ORGANIZER_ID || '';
  const volunteerOverride = getArgValue('volunteer') || process.env.RECOMMENDATION_DEMO_VOLUNTEER_ID || '';

  const organizerId = await resolveUserId('organizer', organizerOverride);
  const volunteerId = await resolveUserId('volunteer', volunteerOverride);

  const volunteerProfile = await ensureVolunteerProfile(volunteerId);
  const activityResults = [];
  for (const template of DEMO_ACTIVITY_TEMPLATES) {
    activityResults.push(await upsertDemoActivity(organizerId, template));
  }

  const activityIds = activityResults.map((entry) => entry.activity?.id).filter(Boolean);
  const registrationsCleared = await clearVolunteerRegistrations(volunteerId, activityIds);
  const organizerNotification = await ensureNotification({
    userId: organizerId,
    title: 'Recommendation Summary Ready',
    message: 'Volunteer recommendations are ready for your current published activities.',
    type: 'message',
    data: {
      activityIds,
      source: 'seedRecommendationDemo',
    },
  });

  console.log('Recommendation demo seed complete.');
  console.log({
    organizerId,
    volunteerId,
    volunteerProfile,
    activities: activityResults.map((entry) => ({
      id: entry.activity?.id ?? null,
      title: entry.activity?.title ?? null,
      startTime: entry.activity?.start_time ?? null,
      created: entry.created,
    })),
    organizerNotification: {
      id: organizerNotification.notification?.id ?? null,
      created: organizerNotification.created,
    },
    registrationsCleared,
  });
}

run().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
