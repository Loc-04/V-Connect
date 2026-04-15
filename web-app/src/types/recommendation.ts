import type { ActivityLocation } from './activity';

export interface RecommendationScoreBreakdown {
  skill_score: number;
  interest_score: number;
  availability_score: number;
  experience_score: number;
  history_score: number;
  final_score: number;
}

export interface RecommendationFeatureContribution {
  feature: string;
  score: number;
  max_score: number;
  detail: string;
}

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
  reason_codes?: string[];
  score_breakdown?: RecommendationScoreBreakdown | null;
  feature_contributions?: RecommendationFeatureContribution[];
  model_version?: string | null;
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
  reason_codes?: string[];
  score_breakdown?: RecommendationScoreBreakdown | null;
  feature_contributions?: RecommendationFeatureContribution[];
  model_version?: string | null;
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
