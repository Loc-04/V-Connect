/** Response from GET /recommendations/:userId for a volunteer */
export interface VolunteerRecommendationActivity {
  activityId: string;
  title: string;
  organizerId: string;
  organizerName: string;
  matchScore: number;
  matchRatio: number;
  reasons: string[];
  explanation: string;
  location: unknown;
  startTime: string;
  endTime: string;
  hours: number;
  requiredSkills: string[];
  status: string;
  /** Set when API returns it; otherwise merged from published activities in Explore. */
  cover_image_url?: string | null;
  recommendation_item_id?: string | null;
  match_tier?: string | null;
  ai_decision?: {
    decision?: string;
    summary?: string;
    display_explanation?: string;
  } | null;
  reason_codes?: string[];
  score_breakdown?: Record<string, unknown> | null;
  model_kind?: string | null;
}

export interface VolunteerRecommendationsResponse {
  userId: string;
  role: 'volunteer';
  activities: VolunteerRecommendationActivity[];
}
