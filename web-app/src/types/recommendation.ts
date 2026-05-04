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
  recommendation_item_id?: string | null;
  title: string;
  organizerId: string;
  organizerName: string;
  matchScore: number;
  matchRatio: number;
  reasons: string[];
  explanation: string;
  location: ActivityLocation | string | null;
  coverImageUrl: string;
  startTime: string;
  endTime: string;
  hours: number | null;
  requiredSkills: string[];
  status: string;
  reason_codes?: string[];
  score_breakdown?: RecommendationScoreBreakdown | null;
  feature_contributions?: RecommendationFeatureContribution[];
  model_version?: string | null;
  provider?: string | null;
  model_kind?: string | null;
  display_explanation?: string | null;
  display_reasons?: string[] | null;
  ai_badge_label?: string | null;
  feature_snapshot?: Record<string, unknown> | null;
  prediction_snapshot?: Record<string, unknown> | null;
}

export interface RecommendedVolunteerRecord {
  userId: string;
  recommendation_item_id?: string | null;
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
  provider?: string | null;
  model_kind?: string | null;
  display_explanation?: string | null;
  display_reasons?: string[] | null;
  ai_badge_label?: string | null;
  feature_snapshot?: Record<string, unknown> | null;
  prediction_snapshot?: Record<string, unknown> | null;
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
