import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes('--dry-run');

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) / SUPABASE_SERVICE_ROLE_KEY in shared-backend/.env');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const validRoles = new Set(['admin', 'organizer', 'volunteer']);

function toCleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRole(value) {
  const role = toCleanString(value).toLowerCase();
  return validRoles.has(role) ? role : 'volunteer';
}

function guessFullName(user) {
  const metadata = user.user_metadata ?? {};
  const raw =
    toCleanString(metadata.full_name) ||
    toCleanString(metadata.fullName) ||
    toCleanString(metadata.name);

  if (raw) {
    return raw;
  }

  const emailLocal = toCleanString(user.email).split('@')[0] ?? '';
  if (emailLocal) {
    return emailLocal.replace(/[._-]+/g, ' ').trim();
  }

  return `User ${String(user.id).slice(0, 8)}`;
}

function guessPhone(user) {
  const metadata = user.user_metadata ?? {};
  const raw =
    toCleanString(metadata.phone) ||
    toCleanString(metadata.phone_number) ||
    toCleanString(metadata.phoneNumber);

  if (raw) {
    return raw;
  }

  return '';
}

function fallbackPhoneFromUserId(userId, salt = 0) {
  const source = `${String(userId)}${String(salt)}`.replace(/-/g, '').toLowerCase();
  let phone = '';

  for (const char of source) {
    if (/\d/.test(char)) {
      phone += char;
    } else {
      phone += String(char.charCodeAt(0) % 10);
    }

    if (phone.length >= 10) {
      break;
    }
  }

  while (phone.length < 10) {
    phone += '0';
  }

  return phone;
}

async function resolveUniquePhone(preferredPhone, userId) {
  let candidate = toCleanString(preferredPhone) || fallbackPhoneFromUserId(userId, 0);

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('phone', candidate)
      .maybeSingle();

    if (error) {
      throw new Error(`users phone lookup failed for ${userId}: ${error.message}`);
    }

    if (!data || data.id === userId) {
      return candidate;
    }

    candidate = fallbackPhoneFromUserId(userId, attempt + 1);
  }

  throw new Error(`Could not generate a unique phone value for user ${userId}`);
}

async function listAllAuthUsers() {
  const users = [];
  const perPage = 200;
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw error;
    }

    const chunk = data?.users ?? [];
    users.push(...chunk);

    if (chunk.length < perPage) {
      break;
    }

    page += 1;
  }

  return users;
}

async function ensureVolunteerProfile(userId) {
  const { data: existing, error: lookupError } = await supabase
    .from('volunteer_profiles')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`volunteer_profiles lookup failed for ${userId}: ${lookupError.message}`);
  }

  if (existing) {
    return false;
  }

  if (dryRun) {
    return true;
  }

  const { error: insertError } = await supabase.from('volunteer_profiles').insert({
    user_id: userId,
    skills: [],
    interests: [],
    availability: {
      weekdays: false,
      weekends: false,
      evenings: false,
    },
    total_hours: 0,
  });

  if (insertError) {
    throw new Error(`volunteer_profiles insert failed for ${userId}: ${insertError.message}`);
  }

  return true;
}

async function migrate() {
  const users = await listAllAuthUsers();
  const summary = {
    scannedAuthUsers: users.length,
    profilesCreated: 0,
    profilesPatched: 0,
    profilesUntouched: 0,
    volunteerProfilesCreated: 0,
  };

  for (const user of users) {
    const role = normalizeRole(user.user_metadata?.role);
    const fullName = guessFullName(user);
    const phone = await resolveUniquePhone(guessPhone(user), user.id);
    const now = new Date().toISOString();

    const { data: existingProfile, error: existingProfileError } = await supabase
      .from('users')
      .select('id, role, full_name, phone, status')
      .eq('id', user.id)
      .maybeSingle();

    if (existingProfileError) {
      throw new Error(`users lookup failed for ${user.id}: ${existingProfileError.message}`);
    }

    if (!existingProfile) {
      summary.profilesCreated += 1;

      if (!dryRun) {
        const { error: insertError } = await supabase.from('users').insert({
          id: user.id,
          role,
          full_name: fullName,
          phone,
          status: 'active',
          updated_at: now,
        });

        if (insertError) {
          throw new Error(`users insert failed for ${user.id}: ${insertError.message}`);
        }
      }
    } else {
      const patch = {};

      if (!validRoles.has(toCleanString(existingProfile.role).toLowerCase())) {
        patch.role = role;
      }
      if (!toCleanString(existingProfile.full_name)) {
        patch.full_name = fullName;
      }
      if (!toCleanString(existingProfile.phone)) {
        patch.phone = phone;
      }
      if (!toCleanString(existingProfile.status)) {
        patch.status = 'active';
      }

      if (Object.keys(patch).length > 0) {
        summary.profilesPatched += 1;

        if (!dryRun) {
          patch.updated_at = now;
          const { error: updateError } = await supabase.from('users').update(patch).eq('id', user.id);

          if (updateError) {
            throw new Error(`users update failed for ${user.id}: ${updateError.message}`);
          }
        }
      } else {
        summary.profilesUntouched += 1;
      }
    }

    if (role === 'volunteer') {
      const createdVolunteerProfile = await ensureVolunteerProfile(user.id);
      if (createdVolunteerProfile) {
        summary.volunteerProfilesCreated += 1;
      }
    }
  }

  return summary;
}

try {
  const summary = await migrate();
  console.log(`migrate:profiles completed${dryRun ? ' (dry-run)' : ''}`);
  console.table(summary);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`migrate:profiles failed: ${message}`);
  process.exit(1);
}
