import { apiRequest } from '@/src/data/clients';

import type { VolunteerRecommendationsResponse } from './types';

export async function fetchVolunteerRecommendations(
  userId: string,
  limit = 24,
): Promise<VolunteerRecommendationsResponse> {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  return apiRequest<VolunteerRecommendationsResponse>(`/recommendations/${userId}?${params.toString()}`);
}
