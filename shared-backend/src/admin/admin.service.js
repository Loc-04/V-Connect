import { supabaseAdmin } from '../database/supabase.js';

async function countRows(table, { filters = {}, excludeDeleted = false } = {}) {
  let query = supabaseAdmin.from(table).select('*', { head: true, count: 'exact' });
  if (excludeDeleted) {
    query = query.is('deleted_at', null);
  }

  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value);
  }

  const { count, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

async function getDistribution(table, key, excludeDeleted = false) {
  let query = supabaseAdmin.from(table).select(key);
  if (excludeDeleted) {
    query = query.is('deleted_at', null);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).reduce((acc, row) => {
    const value = typeof row[key] === 'string' && row[key].length > 0 ? row[key] : 'unknown';
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

export { countRows, getDistribution };
