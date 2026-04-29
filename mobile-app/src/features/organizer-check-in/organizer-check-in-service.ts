import { apiRequest } from '@/src/data/clients';

/** Minimal participation shape from organizer registration lookup. */
export type OrganizerRegistrationLookup = {
  participation: Record<string, unknown> | null;
};

export async function getRegistrationByVolunteer(
  activityId: string,
  volunteerId: string,
): Promise<OrganizerRegistrationLookup> {
  return apiRequest<OrganizerRegistrationLookup>(
    `/activities/${activityId}/registrations/by-volunteer/${volunteerId}`,
  );
}

export async function checkInByVolunteer(activityId: string, volunteerId: string): Promise<{
  participation: Record<string, unknown>;
}> {
  return apiRequest(`/activities/${activityId}/check-in-by-volunteer/${volunteerId}`, {
    method: 'POST',
  });
}
