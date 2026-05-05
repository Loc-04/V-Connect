import { supabaseAdmin } from '../database/supabase.js';

function normalizeSkillLabel(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeSkillRecord(row) {
  const label = normalizeSkillLabel(row?.skill_name);
  if (!label) {
    return null;
  }

  return {
    id: typeof row?.id === 'string' && row.id.trim() ? row.id.trim() : label.toLowerCase().replace(/\s+/g, '-'),
    skill_name: label,
    name: label,
    label,
    value: label,
  };
}

function isMissingTableError(message) {
  const normalized = String(message ?? '').toLowerCase();
  return (
    normalized.includes('relation "core_skills" does not exist') ||
    normalized.includes("could not find the table 'public.core_skills'")
  );
}

function isMissingSkillNameColumnError(message) {
  const normalized = String(message ?? '').toLowerCase();
  return (
    normalized.includes('column core_skills.skill_name does not exist') ||
    normalized.includes('column "skill_name" does not exist')
  );
}

async function listSharedSkills({ limit = 300 } = {}) {
  const { data, error } = await supabaseAdmin
    .from('core_skills')
    .select('id, skill_name')
    .order('skill_name', { ascending: true })
    .limit(limit);

  if (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isMissingTableError(message)) {
      throw new Error('SKILL_CATALOG_TABLE_NOT_CONFIGURED');
    }
    if (isMissingSkillNameColumnError(message)) {
      throw new Error('SKILL_CATALOG_COLUMN_NOT_CONFIGURED');
    }
    throw new Error(`SKILL_CATALOG_QUERY_FAILED: ${message}`);
  }

  const normalized = (Array.isArray(data) ? data : [])
    .map((row) => normalizeSkillRecord(row))
    .filter((row) => row !== null);

  const deduped = [];
  const seen = new Set();
  for (const row of normalized) {
    const key = row.skill_name.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(row);
  }

  return deduped;
}

export { listSharedSkills };
