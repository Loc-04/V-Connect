import { apiRequest } from './api';
import { resolveActivityCoverImageUrl } from './activityCover';
import type { GuestActivityRecord } from './guestActivities';

interface PublicGuestActivityLocation {
  address?: string;
  city?: string;
  meetingPoint?: string;
  lat?: number | null;
  lng?: number | null;
}

interface PublicGuestActivityOrganizer {
  id?: string | null;
  name?: string;
  avatarUrl?: string;
}

interface PublicGuestActivityApiRecord {
  id: string;
  title: string;
  description?: string;
  coverImageUrl?: string;
  location?: PublicGuestActivityLocation | null;
  startTime: string;
  endTime: string;
  capacity: number;
  currentParticipants?: number;
  requiredSkills?: string[];
  status: 'published';
  organizer?: PublicGuestActivityOrganizer | null;
}

interface PublicGuestActivitiesResponse {
  activities?: PublicGuestActivityApiRecord[];
}

interface PublicGuestActivityResponse {
  activity?: PublicGuestActivityApiRecord | null;
}

function shouldTryAlternatePublicPath(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes('route not found') || message.includes('request failed (404)');
}

async function requestPublicWithFallback<T>(primaryPath: string, fallbackPath: string): Promise<T> {
  try {
    return await apiRequest<T>(primaryPath);
  } catch (error) {
    if (!shouldTryAlternatePublicPath(error)) {
      throw error;
    }
    return apiRequest<T>(fallbackPath);
  }
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function computeDurationLabel(startTime: string, endTime: string) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'TBD';
  }

  const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  if (!Number.isFinite(hours) || hours <= 0) {
    return 'TBD';
  }

  const rounded = Math.round(hours * 10) / 10;
  return `${rounded} hour${rounded === 1 ? '' : 's'}`;
}

function toGuestActivityRecord(activity: PublicGuestActivityApiRecord): GuestActivityRecord {
  const rawDescription = typeof activity.description === 'string' ? activity.description.trim() : '';
  const description = rawDescription || 'No description has been provided for this activity yet.';
  const requiredSkills = Array.isArray(activity.requiredSkills)
    ? activity.requiredSkills.map((skill) => String(skill).trim()).filter(Boolean)
    : [];
  const domain = requiredSkills[0] || 'Community';
  const tags = requiredSkills.slice(0, 3);
  const imageUrl = resolveActivityCoverImageUrl(activity.coverImageUrl);
  const capacity = Number.isFinite(Number(activity.capacity)) ? Number(activity.capacity) : 0;
  const currentParticipants = Number.isFinite(Number(activity.currentParticipants))
    ? Number(activity.currentParticipants)
    : 0;

  return {
    id: activity.id,
    title: activity.title,
    organization: activity.organizer?.name?.trim() || 'Community Organizer',
    organizerName: activity.organizer?.name?.trim() || 'Organizer',
    organizerTitle: 'Activity Organizer',
    organizerAvatarUrl: activity.organizer?.avatarUrl?.trim() || '',
    organizerRating: 0,
    organizerNote: '',
    excerpt: truncate(description, 140),
    cardSummary: truncate(description, 160),
    description,
    impactSummary: truncate(description, 220),
    location: {
      address: activity.location?.address?.trim() || 'Address not provided',
      city: activity.location?.city?.trim() || 'City not specified',
      meetingPoint: activity.location?.meetingPoint?.trim() || activity.location?.address?.trim() || 'Meeting point will be shared by the organizer',
      lat: Number.isFinite(Number(activity.location?.lat)) ? Number(activity.location?.lat) : 0,
      lng: Number.isFinite(Number(activity.location?.lng)) ? Number(activity.location?.lng) : 0,
    },
    startTime: activity.startTime,
    endTime: activity.endTime,
    capacity,
    currentParticipants,
    requiredSkills,
    status: 'published',
    imageUrl,
    mapImageUrl: imageUrl,
    domain,
    tags,
    requirements:
      requiredSkills.length > 0
        ? requiredSkills.map((skill) => ({
            title: `${skill} Skill`,
            description: `Helpful for this activity: ${skill}.`,
          }))
        : [
            {
              title: 'Preparation',
              description: 'No specific requirements were listed by the organizer.',
            },
          ],
    featured: false,
    stats: [
      { label: 'Capacity', value: capacity > 0 ? `${capacity} volunteers` : 'TBD' },
      { label: 'Duration', value: computeDurationLabel(activity.startTime, activity.endTime) },
      { label: 'Status', value: 'Published' },
      { label: 'Spots', value: capacity > 0 ? `${Math.max(capacity - currentParticipants, 0)} open` : 'TBD' },
    ],
  };
}

export async function listPublicGuestActivities(limit = 120): Promise<GuestActivityRecord[]> {
  const query = new URLSearchParams({ limit: String(limit) }).toString();
  const response = await requestPublicWithFallback<PublicGuestActivitiesResponse>(
    `/public/activities?${query}`,
    `/api/public/activities?${query}`
  );
  const activities = Array.isArray(response.activities) ? response.activities : [];

  const safeActivities: GuestActivityRecord[] = [];
  for (const activity of activities) {
    try {
      safeActivities.push(toGuestActivityRecord(activity));
    } catch {
      // Ignore malformed rows so one bad record does not break the whole guest list.
    }
  }
  return safeActivities;
}

export async function getPublicGuestActivityById(activityId: string): Promise<GuestActivityRecord> {
  const response = await requestPublicWithFallback<PublicGuestActivityResponse>(
    `/public/activities/${activityId}`,
    `/api/public/activities/${activityId}`
  );
  if (!response.activity) {
    throw new Error('Activity not found.');
  }
  try {
    return toGuestActivityRecord(response.activity);
  } catch {
    throw new Error('Activity data is unavailable right now.');
  }
}
