import { apiRequest } from './api';
import type {
  ActivityRecommendationResponse,
  RecommendedActivityRecord,
  RecommendedVolunteerRecord,
  UserRecommendationResponse,
} from '../types/recommendation';

export async function getRecommendationsForUser(
  userId: string,
  accessToken: string,
  limit = 10
): Promise<UserRecommendationResponse> {
  return apiRequest<UserRecommendationResponse>(`/recommendations/${userId}?limit=${Math.trunc(limit)}`, {
    accessToken,
  });
}

export async function getRecommendedActivitiesForVolunteer(
  userId: string,
  accessToken: string,
  limit = 10
): Promise<RecommendedActivityRecord[]> {
  const response = await getRecommendationsForUser(userId, accessToken, limit);
  return response.activities ?? [];
}

export async function getRecommendedVolunteersForOrganizer(
  userId: string,
  accessToken: string,
  limit = 10
): Promise<RecommendedVolunteerRecord[]> {
  const response = await getRecommendationsForUser(userId, accessToken, limit);
  return response.volunteers ?? [];
}

export async function getRecommendationsForActivity(
  activityId: string,
  accessToken: string,
  limit = 10
): Promise<ActivityRecommendationResponse> {
  return apiRequest<ActivityRecommendationResponse>(
    `/recommendations/activity/${activityId}?limit=${Math.trunc(limit)}`,
    {
      accessToken,
    }
  );
}
