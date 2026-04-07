export interface FeedbackRecord {
  id: string;
  participation_id: string;
  volunteer_id: string;
  organizer_id: string | null;
  rating: number;
  comment: string | null;
  created_at: string | null;
  ai_label?: string | null;
  is_spam?: boolean | null;
  ai_spam_reasons?: string[] | null;
  ai_sentiment_label?: 'positive' | 'negative' | 'neutral' | null;
  ai_incident_label?: 'incident' | 'none' | null;
  ai_semantic_label?: 'incident' | 'positive' | 'negative' | 'neutral' | null;
  ai_semantic_reasons?: string[] | string | null;
  review_status?: string | null;
  is_flagged?: boolean | null;
  flag_reason?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
}

export interface FeedbackPayload {
  participationId: string;
  rating: number;
  comment: string;
}

export interface FeedbackReviewModerationPayload {
  status?: 'pending' | 'in_review' | 'resolved' | 'dismissed';
  flag?: boolean;
  reason?: string;
}
