import { userColumns, volunteerColumns } from '../config/constants.js';
import { supabaseAdmin } from '../database/supabase.js';

async function getProfileByUserId(userId) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select(userColumns)
    .eq('id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}

async function getVolunteerProfileByUserId(userId) {
  const { data, error } = await supabaseAdmin
    .from('volunteer_profiles')
    .select(volunteerColumns)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}

export { getProfileByUserId, getVolunteerProfileByUserId };
