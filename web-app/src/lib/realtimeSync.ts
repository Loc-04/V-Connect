const PARTICIPATION_SYNC_KEY = 'vconnect.participation.sync';

export function emitParticipationSync(activityId: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      PARTICIPATION_SYNC_KEY,
      JSON.stringify({
        activityId,
        updatedAt: Date.now(),
      })
    );
  } catch {
    // Ignore storage write failures.
  }
}

export function onParticipationSync(listener: (activityId: string) => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = (event: StorageEvent) => {
    if (event.key !== PARTICIPATION_SYNC_KEY || !event.newValue) {
      return;
    }

    try {
      const payload = JSON.parse(event.newValue) as { activityId?: string };
      if (typeof payload.activityId === 'string' && payload.activityId) {
        listener(payload.activityId);
      }
    } catch {
      // Ignore malformed payloads.
    }
  };

  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener('storage', handler);
  };
}

