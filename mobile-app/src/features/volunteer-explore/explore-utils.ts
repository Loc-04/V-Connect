const HERO_IMAGES = [
  'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=800&q=80',
  'https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?w=800&q=80',
  'https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=800&q=80',
  'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=800&q=80',
];

export function pickHeroImage(seed: string): string {
  let sum = 0;
  for (let i = 0; i < seed.length; i += 1) {
    sum += seed.charCodeAt(i);
  }
  return HERO_IMAGES[sum % HERO_IMAGES.length];
}

/**
 * Resolve the Explore card image: try each cover URL in order (activity / API),
 * then fall back to deterministic Unsplash art from `pickHeroImage(seed)`.
 */
export function resolveExploreCoverUrl(
  seed: string,
  ...sources: (string | null | undefined)[]
): string {
  for (const s of sources) {
    const t = typeof s === 'string' ? s.trim() : '';
    if (t.length > 0) return t;
  }
  return pickHeroImage(seed);
}

export function categoryFromSkills(skills: string[]): string {
  const first = skills.find((s) => String(s).trim().length > 0);
  if (!first) return 'Community';
  const word = String(first).trim();
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function formatLocationLine(location: unknown): string {
  if (location == null) return 'Location TBD';
  if (typeof location === 'string') return location || 'Location TBD';
  if (typeof location === 'object' && location !== null) {
    const loc = location as Record<string, unknown>;
    const formatted = typeof loc.formattedAddress === 'string' ? loc.formattedAddress.trim() : '';
    if (formatted) return formatted;
    const address = typeof loc.address === 'string' ? loc.address.trim() : '';
    const city = typeof loc.city === 'string' ? loc.city.trim() : '';
    const parts = [address, city].filter(Boolean);
    if (parts.length > 0) return parts.join(', ');
  }
  return 'Location TBD';
}

export function formatDateRangeLine(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'Date TBD';
  }

  const dayPart = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(start);

  const timeFmt = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const startT = timeFmt.format(start);
  const endT = timeFmt.format(end);

  return `${dayPart} • ${startT} – ${endT}`;
}
