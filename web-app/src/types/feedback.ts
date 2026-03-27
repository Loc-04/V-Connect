export interface FeedbackRecord {
  id: string;
  participation_id: string;
  volunteer_id: string;
  organizer_id: string | null;
  rating: number;
  comment: string | null;
  created_at: string | null;
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
