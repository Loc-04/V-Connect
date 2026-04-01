import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(
    'Missing environment variables. Ensure EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env'
  );
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_PASSWORD = 'TestPassword123!';

const mockUsers = [
  { email: 'admin@vconnect.test', role: 'admin', full_name: 'Admin User', phone: '+1000000001' },
  { email: 'organizer@vconnect.test', role: 'organizer', full_name: 'Jane Organizer', phone: '+1000000002' },
  { email: 'volunteer1@vconnect.test', role: 'volunteer', full_name: 'John Volunteer', phone: '+1000000003' },
  { email: 'volunteer2@vconnect.test', role: 'volunteer', full_name: 'Sarah Helper', phone: '+1000000004' },
];

const mockVolunteerProfiles = [
  {
    skills: ['first-aid', 'driving', 'cooking'],
    interests: ['elderly-care', 'environment'],
    available_choices: [
      'mon_mor',
      'mon_aft',
      'tue_mor',
      'wed_aft',
      'sat_mor',
      'sun_mor',
      'sun_aft',
    ],
    total_hours: 24,
  },
  {
    skills: ['teaching', 'photography'],
    interests: ['education', 'youth'],
    available_choices: ['fri_eve', 'sat_mor', 'sat_aft', 'sun_mor', 'sun_eve'],
    total_hours: 12,
  },
];

const mockActivities = [
  {
    title: 'Beach Cleanup Drive',
    description: 'Join us for a community beach cleanup. Help preserve our coastline and protect marine life.',
    location: { address: '123 Coastal Road', city: 'Seaside', lat: 34.0195, lng: -118.4912 },
    start_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    end_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000).toISOString(),
    capacity: 30,
    required_skills: ['driving'],
    status: 'published',
  },
  {
    title: 'Senior Center Visit',
    description: 'Spend time with elderly residents at the local senior center. Activities include board games and conversation.',
    location: { address: '456 Care Lane', city: 'Downtown', lat: 34.0522, lng: -118.2437 },
    start_time: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    end_time: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000).toISOString(),
    capacity: 10,
    required_skills: [],
    status: 'draft',
  },
  {
    title: 'Food Bank Distribution',
    description: 'Help sort and distribute food packages to families in need.',
    location: { address: '789 Charity Blvd', city: 'Midtown', lat: 34.0407, lng: -118.2468 },
    start_time: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    end_time: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000).toISOString(),
    capacity: 20,
    required_skills: ['driving', 'cooking'],
    status: 'completed',
  },
];

async function cleanExistingData() {
  console.log('Cleaning existing seed data...');

  await supabase.from('activity_reports').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('activity_participations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('activities').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('volunteer_profiles').delete().neq('user_id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('users').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  for (const user of mockUsers) {
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existing = existingUsers?.users.find((u) => u.email === user.email);
    if (existing) {
      await supabase.auth.admin.deleteUser(existing.id);
    }
  }

  console.log('Cleanup complete.');
}

async function seed() {
  console.log('Starting mock data seed...\n');

  await cleanExistingData();

  // 1. Create auth users and public.users
  console.log('Creating users...');
  const userIds: string[] = [];

  for (const user of mockUsers) {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: user.email,
      password: TEST_PASSWORD,
      email_confirm: true,
    });

    if (authError) {
      console.error(`Failed to create auth user ${user.email}:`, authError.message);
      process.exit(1);
    }

    const userId = authData.user.id;
    userIds.push(userId);

    const { error: userError } = await supabase.from('users').insert({
      id: userId,
      role: user.role,
      full_name: user.full_name,
      phone: user.phone,
      status: 'active',
    });

    if (userError) {
      console.error(`Failed to create public.users record for ${user.email}:`, userError.message);
      process.exit(1);
    }

    console.log(`  Created: ${user.full_name} (${user.role})`);
  }

  // 2. Create volunteer profiles (for volunteer users only)
  console.log('\nCreating volunteer profiles...');
  const volunteerUserIds = userIds.slice(2); // volunteer1 and volunteer2

  for (let i = 0; i < volunteerUserIds.length; i++) {
    const { error } = await supabase.from('volunteer_profiles').insert({
      user_id: volunteerUserIds[i],
      ...mockVolunteerProfiles[i],
    });

    if (error) {
      console.error(`Failed to create volunteer profile:`, error.message);
      process.exit(1);
    }
    console.log(`  Created profile for user ${volunteerUserIds[i]}`);
  }

  // 3. Create activities (organizer is userIds[1])
  console.log('\nCreating activities...');
  const organizerId = userIds[1];
  const activityIds: string[] = [];

  for (const activity of mockActivities) {
    const { data, error } = await supabase
      .from('activities')
      .insert({
        organizer_id: organizerId,
        ...activity,
      })
      .select('id')
      .single();

    if (error) {
      console.error(`Failed to create activity "${activity.title}":`, error.message);
      process.exit(1);
    }

    activityIds.push(data.id);
    console.log(`  Created: ${activity.title} (${activity.status})`);
  }

  // 4. Create activity participations
  console.log('\nCreating activity participations...');
  const participations = [
    { activity_id: activityIds[0], volunteer_id: volunteerUserIds[0], status: 'approved', ai_match_score: 0.85 },
    { activity_id: activityIds[0], volunteer_id: volunteerUserIds[1], status: 'pending', ai_match_score: 0.72 },
    { activity_id: activityIds[2], volunteer_id: volunteerUserIds[0], status: 'checked_in', ai_match_score: 0.91, checked_in_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() },
    { activity_id: activityIds[2], volunteer_id: volunteerUserIds[1], status: 'approved', ai_match_score: 0.68 },
  ];

  for (const participation of participations) {
    const { error } = await supabase.from('activity_participations').insert(participation);

    if (error) {
      console.error(`Failed to create participation:`, error.message);
      process.exit(1);
    }
  }
  console.log(`  Created ${participations.length} participations`);

  // 5. Create activity report for completed activity
  console.log('\nCreating activity report...');
  const { error: reportError } = await supabase.from('activity_reports').insert({
    activity_id: activityIds[2],
    ai_summary: 'The food bank distribution event was successful. 150 families received food packages. Volunteers worked efficiently despite initial sorting challenges.',
    key_outcomes: ['150 families served', '500kg of food distributed', '8 volunteers participated'],
    identified_issues: ['Need more sorting tables', 'Parking was limited'],
  });

  if (reportError) {
    console.error('Failed to create activity report:', reportError.message);
    process.exit(1);
  }
  console.log('  Created report for "Food Bank Distribution"');

  console.log('\n✓ Seed completed successfully!');
  console.log('\nTest accounts (password: TestPassword123!):');
  mockUsers.forEach((u) => console.log(`  ${u.email} - ${u.role}`));
}

seed();
