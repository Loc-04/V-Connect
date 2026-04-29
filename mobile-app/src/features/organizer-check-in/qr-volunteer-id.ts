/** Extract volunteer UUID from QR raw string (JSON with volunteerId, or bare UUID). */
export function parseVolunteerIdFromQrPayload(raw: string): string | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const keys = ['volunteerId', 'volunteer_id', 'userId', 'id'];
    for (const key of keys) {
      const v = parsed[key];
      if (typeof v === 'string' && looksLikeUuid(v)) {
        return v.trim().toLowerCase();
      }
    }
  } catch {
    // not JSON
  }

  if (looksLikeUuid(trimmed)) {
    return trimmed.toLowerCase();
  }

  return null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function looksLikeUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}
