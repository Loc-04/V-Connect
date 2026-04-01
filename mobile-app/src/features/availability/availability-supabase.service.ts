/**
 * Reads/writes `volunteer_profiles.available_choices` via Supabase (text[] slot ids).
 *
 * RLS (verify in Supabase Dashboard): `volunteer_profiles` must allow the authenticated user to
 * `SELECT` and `UPDATE` rows where `user_id = auth.uid()`. Without this, reads return empty or
 * updates fail with a permission / policy error.
 */

import { supabase } from '@/src/data/clients';

import {
  dedupeSortSlots,
  isAvailabilitySlotKey,
  type AvailabilitySlotKey,
} from './availability-schedule.model';

export async function getVolunteerAvailableChoices(userId: string): Promise<AvailabilitySlotKey[]> {
  const { data, error } = await supabase
    .from('volunteer_profiles')
    .select('available_choices')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const raw = data?.available_choices;
  if (!Array.isArray(raw)) {
    return [];
  }

  const strings = raw.filter((item): item is string => typeof item === 'string');
  return dedupeSortSlots(strings.filter((s) => isAvailabilitySlotKey(s)));
}

export async function saveVolunteerAvailableChoices(
  userId: string,
  slots: AvailabilitySlotKey[],
): Promise<void> {
  const payload = dedupeSortSlots(slots);
  const { error } = await supabase
    .from('volunteer_profiles')
    .update({
      available_choices: payload,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    throw new Error(error.message);
  }
}
