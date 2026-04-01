export type GuestProtectedAction = 'join' | 'save' | 'ai_match' | 'contact';

const GUEST_INTENT_PARAM = 'guestIntent';

export function buildGuestActivityIntentPath(activityId: string, action: GuestProtectedAction) {
  const params = new URLSearchParams();
  params.set(GUEST_INTENT_PARAM, action);
  return `/guest/activity/${activityId}?${params.toString()}`;
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
