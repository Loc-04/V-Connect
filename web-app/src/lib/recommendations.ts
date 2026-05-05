import { apiRequest } from './api';
import { resolveActivityCoverImageUrl } from './activityCover';
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

type RecommendationInteractionEventType =
  | 'detail_open'
  | 'register'
  | 'approved'
  | 'rejected'
  | 'checked_in'
  | 'cancelled';

function normalizeRecommendedActivityRecord(record: RecommendedActivityRecord): RecommendedActivityRecord {
  return {
    ...record,
    coverImageUrl: resolveActivityCoverImageUrl(record.coverImageUrl),
  };
}

function pickVolunteerRecommendationItems(response: UserRecommendationResponse): RecommendedActivityRecord[] {
  const itemsFromActivities = Array.isArray(response.activities) ? response.activities : [];
  const itemsFromController =
    itemsFromActivities.length > 0
      ? itemsFromActivities
      : Array.isArray(response.items)
        ? response.items
        : [];

  return itemsFromController
    .filter((item) => {
      const decision = String(item?.ai_decision?.decision ?? '').trim().toLowerCase();
      if (!decision) {
        return true;
      }
      return decision === 'recommend' || decision === 'consider';
    })
    .map((item) => normalizeRecommendedActivityRecord(item));
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
  return pickVolunteerRecommendationItems(response);
}

export async function getVolunteerRecommendationPayload(
  userId: string,
  accessToken: string,
  limit = 10
): Promise<UserRecommendationResponse> {
  const response = await getRecommendationsForUser(userId, accessToken, limit);
  return {
    ...response,
    activities: pickVolunteerRecommendationItems(response),
  };
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
  accessToken: string,
  recommendationItemId?: string | null
): Promise<RecommendationAssignmentResponse> {
  return normalizeAssignmentResponse(
    apiRequest<RecommendationAssignmentResponse>(`/recommendations/activity/${activityId}/assignments`, {
      method: 'POST',
      accessToken,
      body: {
        volunteerId,
        recommendation_item_id: recommendationItemId ?? null,
      },
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

export async function logRecommendationInteraction(
  params: {
    eventType: RecommendationInteractionEventType;
    servingItemId?: string | null;
    activityId?: string | null;
    volunteerId?: string | null;
    participationId?: string | null;
    sourceSurface?: string;
    metadata?: Record<string, unknown> | null;
  },
  accessToken: string
): Promise<void> {
  await apiRequest<{ ok: boolean }>(`/recommendations/interactions`, {
    method: 'POST',
    accessToken,
    body: {
      event_type: params.eventType,
      serving_item_id: params.servingItemId ?? null,
      activity_id: params.activityId ?? null,
      volunteer_id: params.volunteerId ?? null,
      participation_id: params.participationId ?? null,
      source_surface: params.sourceSurface ?? 'web',
      metadata: params.metadata ?? null,
    },
  });
}
