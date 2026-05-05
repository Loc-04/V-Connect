export type GuestProtectedAction = 'join' | 'save' | 'ai_match' | 'contact';

const GUEST_INTENT_PARAM = 'guestIntent';

export function buildGuestActivityIntentPath(activityId: string, action: GuestProtectedAction) {
  const params = new URLSearchParams();
  params.set(GUEST_INTENT_PARAM, action);
  return `/guest/activity/${activityId}?${params.toString()}`;
}

export function appendGuestIntentToPath(path: string, action: GuestProtectedAction) {
  const normalizedPath = String(path ?? '').trim();
  if (!normalizedPath.startsWith('/') || normalizedPath.startsWith('//')) {
    return normalizedPath;
  }

  const hashIndex = normalizedPath.indexOf('#');
  const hash = hashIndex >= 0 ? normalizedPath.slice(hashIndex) : '';
  const withoutHash = hashIndex >= 0 ? normalizedPath.slice(0, hashIndex) : normalizedPath;

  const queryIndex = withoutHash.indexOf('?');
  const pathname = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : '';
  const params = new URLSearchParams(query);
  params.set(GUEST_INTENT_PARAM, action);

  const nextQuery = params.toString();
  return `${pathname}${nextQuery ? `?${nextQuery}` : ''}${hash}`;
}

export function readGuestIntent(value: string | null | undefined): GuestProtectedAction | null {
  if (value === 'join' || value === 'save' || value === 'ai_match' || value === 'contact') {
    return value;
  }

  return null;
}

export function getGuestIntentParamName() {
  return GUEST_INTENT_PARAM;
}
