const sharedInterestCatalog = [
  'Education',
  'Environment',
  'Healthcare',
  'Community Support',
  'Children & Youth',
  'Elderly Support',
  'Animal Welfare',
  'Disaster Relief',
  'Fundraising',
  'Event Support',
  'Public Safety',
  'Food Distribution',
  'Technology',
  'Arts & Culture',
  'Sports',
  'Social Work',
  'Accessibility',
  'Sustainability',
  'Blood Donation',
  'Mental Health Awareness',
] as const;

function normalizeInterestText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeInterestKey(value: string) {
  return normalizeInterestText(value).toLowerCase();
}

function buildCanonicalMap(catalog: string[], extraInterests: string[] = []) {
  const canonicalMap = new Map<string, string>();
  const merged = [...catalog, ...extraInterests];

  for (const item of merged) {
    if (typeof item !== 'string') {
      continue;
    }

    const normalized = normalizeInterestText(item);
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (!canonicalMap.has(key)) {
      canonicalMap.set(key, normalized);
    }
  }

  return canonicalMap;
}

export function getSharedInterestCatalog(): string[] {
  return [...sharedInterestCatalog];
}

export function resolveCanonicalInterestLabel(value: string, catalog: string[], extraInterests: string[] = []) {
  const normalized = normalizeInterestText(value);
  if (!normalized) {
    return '';
  }

  const key = normalized.toLowerCase();
  const canonicalMap = buildCanonicalMap(catalog, extraInterests);
  return canonicalMap.get(key) ?? normalized;
}

export function isKnownSharedInterest(value: string, catalog: string[]) {
  const normalized = normalizeInterestText(value);
  if (!normalized) {
    return false;
  }

  const catalogSet = new Set(catalog.map((item) => normalizeInterestKey(item)).filter(Boolean));
  return catalogSet.has(normalized.toLowerCase());
}

export function filterSharedInterests(query: string, catalog: string[], extraInterests: string[] = []) {
  const canonicalMap = buildCanonicalMap(catalog, extraInterests);
  const merged = Array.from(canonicalMap.values());
  const normalizedQuery = normalizeInterestKey(query);

  if (!normalizedQuery) {
    return merged;
  }

  return merged.filter((item) => normalizeInterestKey(item).includes(normalizedQuery));
}

export function normalizeInterestSelection(values: string[], catalog: string[]) {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const raw of values) {
    if (typeof raw !== 'string') {
      continue;
    }

    const canonical = resolveCanonicalInterestLabel(raw, catalog, values);
    if (!canonical) {
      continue;
    }

    const key = canonical.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(canonical);
  }

  return deduped;
}
