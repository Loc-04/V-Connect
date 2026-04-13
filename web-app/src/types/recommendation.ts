import type { ActivityLocation } from './activity';

export interface RecommendedActivityRecord {
  activityId: string;
  title: string;
  organizerId: string;
  organizerName: string;
  matchScore: number;
  matchRatio: number;
  reasons: string[];
  explanation: string;
  location: ActivityLocation | string | null;
  coverImageUrl: string | null;
  startTime: string;
  endTime: string;
  hours: number | null;
  requiredSkills: string[];
  status: string;
}

export interface RecommendedVolunteerRecord {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  matchScore: number;
  matchRatio: number;
  reasons: string[];
  explanation: string;
  skills: string[];
  interests: string[];
  availableChoices: string[];
  availabilitySummary: string;
  totalHours: number;
}

export interface UserRecommendationResponse {
  userId: string;
  role: 'volunteer' | 'organizer' | string;
  activities?: RecommendedActivityRecord[];
  volunteers?: RecommendedVolunteerRecord[];
}

export interface ActivityRecommendationResponse {
  activity: {
    id: string;
    title: string;
    status: string;
  };
  volunteers: RecommendedVolunteerRecord[];
}
