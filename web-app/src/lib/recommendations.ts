import { apiRequest } from './api';
import { normalizeParticipationRecord } from './participations';
import type { ParticipationRecord } from '../types/participation';
import type {
  ActivityRecommendationResponse,
  RecommendedActivityRecord,
  RecommendedVolunteerRecord,
  UserRecommendationResponse,
} from '../types/recommendation';

interface RecommendationAssignmentResponse {
  assignment: ParticipationRecord;
  created?: boolean;
  message?: string;
}

async function normalizeAssignmentResponse<T extends RecommendationAssignmentResponse>(promise: Promise<T>): Promise<T> {
  const response = await promise;
  return {
    ...response,
    assignment: normalizeParticipationRecord(response.assignment),
  };
}

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

export async function createRecommendationAssignment(
  activityId: string,
  volunteerId: string,
  accessToken: string
): Promise<RecommendationAssignmentResponse> {
  return normalizeAssignmentResponse(
    apiRequest<RecommendationAssignmentResponse>(`/recommendations/activity/${activityId}/assignments`, {
      method: 'POST',
      accessToken,
      body: { volunteerId },
    })
  );
}

export async function updateRecommendationAssignmentStatus(
  assignmentId: string,
  status: 'assigned' | 'approved' | 'rejected' | 'cancelled',
  accessToken: string
): Promise<RecommendationAssignmentResponse> {
  return normalizeAssignmentResponse(
    apiRequest<RecommendationAssignmentResponse>(`/recommendations/assignments/${assignmentId}/status`, {
      method: 'PUT',
      accessToken,
      body: { status },
    })
  );
}

export async function deleteRecommendationAssignment(
  assignmentId: string,
  accessToken: string
): Promise<RecommendationAssignmentResponse> {
  return normalizeAssignmentResponse(
    apiRequest<RecommendationAssignmentResponse>(`/recommendations/assignments/${assignmentId}`, {
      method: 'DELETE',
      accessToken,
    })
  );
}
