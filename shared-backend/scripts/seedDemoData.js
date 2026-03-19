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

const DEMO_TITLE = 'Demo Activity - Sprint 2';

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
    throw new Error(`No user found with role "${role}". Provide --${role}=<USER_ID> or set DEMO_${role.toUpperCase()}_ID.`);
  }

  return user.id;
}

function buildDemoTimes() {
  const start = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

async function ensureDemoActivity(organizerId) {
  const { data: existing, error } = await supabase
    .from('activities')
    .select('id, title, status')
    .eq('organizer_id', organizerId)
    .eq('title', DEMO_TITLE)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to lookup demo activity: ${error.message}`);
  }

  if (existing) {
    return { activity: existing, created: false };
  }

  const { startTime, endTime } = buildDemoTimes();
  const now = new Date().toISOString();

  const { data, error: insertError } = await supabase
    .from('activities')
    .insert({
      organizer_id: organizerId,
      title: DEMO_TITLE,
      description: 'Activity 2.',
      location: {
        address: 'Community Center',
        city: 'Ho Chi Minh City',
        lat: 10.8231,
        lng: 106.6297,
      },
      start_time: startTime,
      end_time: endTime,
      capacity: 25,
      required_skills: ['teamwork', 'coordination'],
      status: 'published',
      created_at: now,
      updated_at: now,
    })
    .select('id, title, status')
    .maybeSingle();

  if (insertError) {
    throw new Error(`Failed to create demo activity: ${insertError.message}`);
  }

  return { activity: data, created: true };
}

async function ensureParticipation(activityId, volunteerId) {
  const { data: existing, error } = await supabase
    .from('activity_participations')
    .select('id, status')
    .eq('activity_id', activityId)
    .eq('volunteer_id', volunteerId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to lookup participation: ${error.message}`);
  }

  if (existing) {
    return { participation: existing, created: false };
  }

  const now = new Date().toISOString();
  const { data, error: insertError } = await supabase
    .from('activity_participations')
    .insert({
      activity_id: activityId,
      volunteer_id: volunteerId,
      status: 'approved',
      created_at: now,
      updated_at: now,
    })
    .select('id, status')
    .maybeSingle();

  if (insertError) {
    throw new Error(`Failed to create participation: ${insertError.message}`);
  }

  return { participation: data, created: true };
}

async function createNotification(userId, activityId) {
  const now = new Date().toISOString();
  const payload = {
    user_id: userId,
    title: 'Demo Notification',
    message: 'Your demo activity has been approved.',
    type: 'info',
    data: { activityId },
    created_at: now,
  };

  const { data, error } = await supabase.from('notifications').insert(payload).select('id, title, created_at').maybeSingle();
  if (error) {
    if (error.message?.toLowerCase().includes('relation') && error.message?.toLowerCase().includes('notifications')) {
      throw new Error('notifications table not found. Run shared-backend/scripts/create_notifications_table.sql first.');
    }
    throw new Error(`Failed to create notification: ${error.message}`);
  }

  return data;
}

async function run() {
  const organizerOverride = getArgValue('organizer') || process.env.DEMO_ORGANIZER_ID || '';
  const volunteerOverride = getArgValue('volunteer') || process.env.DEMO_VOLUNTEER_ID || '';

  const organizerId = await resolveUserId('organizer', organizerOverride);
  const volunteerId = await resolveUserId('volunteer', volunteerOverride);

  const { activity, created: activityCreated } = await ensureDemoActivity(organizerId);
  const { participation, created: participationCreated } = await ensureParticipation(activity.id, volunteerId);
  const notification = await createNotification(volunteerId, activity.id);

  console.log('Demo seed complete.');
  console.log({
    organizerId,
    volunteerId,
    activityId: activity.id,
    activityCreated,
    participationId: participation.id,
    participationCreated,
    notificationId: notification?.id ?? null,
  });
}

run().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
