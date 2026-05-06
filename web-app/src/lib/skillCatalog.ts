import { apiRequest } from './api';

interface SharedSkillApiItem {
  id: string;
  name?: string;
  skill_name?: string;
  category?: string | null;
  isActive?: boolean;
  sortOrder?: number | null;
}

interface SharedSkillApiResponse {
  skills?: SharedSkillApiItem[] | null;
  message?: string;
}

function normalizeSkillText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeSkillKey(value: string) {
  return normalizeSkillText(value).toLowerCase();
}

export async function getSharedSkillCatalog(accessToken?: string): Promise<string[]> {
  const response = await apiRequest<SharedSkillApiResponse>('/skills', { accessToken });
  const labels = Array.isArray(response.skills)
    ? response.skills
        .map((item) => {
          if (typeof item?.skill_name === 'string') {
            return normalizeSkillText(item.skill_name);
          }
          if (typeof item?.name === 'string') {
            return normalizeSkillText(item.name);
          }
          return '';
        })
        .filter(Boolean)
    : [];

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const label of labels) {
    const key = normalizeSkillKey(label);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(label);
  }

  return deduped;
}

function buildCanonicalMap(catalog: string[], extraSkills: string[] = []) {
  const map = new Map<string, string>();
  const merged = [...catalog, ...extraSkills];

  for (const item of merged) {
    if (typeof item !== 'string') {
      continue;
    }
    const normalized = normalizeSkillText(item);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (!map.has(key)) {
      map.set(key, normalized);
    }
  }

  return map;
}

export function resolveCanonicalSkillLabel(value: string, catalog: string[], extraSkills: string[] = []) {
  const normalized = normalizeSkillText(value);
  if (!normalized) {
    return '';
  }
  const key = normalized.toLowerCase();
  const canonicalMap = buildCanonicalMap(catalog, extraSkills);
  return canonicalMap.get(key) ?? normalized;
}

export function isKnownSharedSkill(value: string, catalog: string[]) {
  const normalized = normalizeSkillText(value);
  if (!normalized) {
    return false;
  }
  const catalogSet = new Set(catalog.map((item) => normalizeSkillKey(item)).filter(Boolean));
  return catalogSet.has(normalized.toLowerCase());
}

export function filterSharedSkills(query: string, catalog: string[], extraSkills: string[] = []) {
  const canonicalMap = buildCanonicalMap(catalog, extraSkills);
  const merged = Array.from(canonicalMap.values());
  const normalizedQuery = normalizeSkillKey(query);

  if (!normalizedQuery) {
    return merged;
  }

  return merged.filter((skill) => normalizeSkillKey(skill).includes(normalizedQuery));
}
