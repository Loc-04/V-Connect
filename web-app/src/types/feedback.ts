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
  ai_semantic_label?: 'incident' | 'positive' | 'negative' | 'neutral' | 'low_signal' | null;
  ai_moderation_labels?: string[] | null;
  ai_semantic_labels?: string[] | null;
  ai_issue_tags?: string[] | null;
  ai_feedback_bucket?: 'spam' | 'low_signal' | 'valid' | string | null;
  ai_text_quality_is_low_signal?: boolean | null;
  ai_text_quality_label?: 'informative' | 'low_signal' | 'uninformative' | string | null;
  ai_text_quality_reasons?: string[] | null;
  final_label?: 'Neu' | 'Pos' | 'Neg' | 'Spam' | string | null;
  finalLabel?: 'Neu' | 'Pos' | 'Neg' | 'Spam' | string | null;
  ai_confidence?: {
    sentiment?: number;
    incident?: number;
    semantic?: number;
  } | null;
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

export interface FeedbackInsightIssue {
  tag: string;
  label: string;
  count: number;
  priority: 'high' | 'medium' | 'low' | string;
}

export interface FeedbackInsightByActivity {
  activityId: string | null;
  activityTitle: string;
  feedbackCount: number;
  averageRating: number;
  repeatedIssues: FeedbackInsightIssue[];
}

export interface FeedbackInsights {
  totals: {
    feedback_count: number;
    spam_count: number;
    low_signal_count?: number;
    valid_feedback_count?: number;
    average_rating: number;
    average_rating_all?: number;
    sentiment: {
      positive: number;
      neutral: number;
      negative: number;
    };
  };
  repeatedIssues: FeedbackInsightIssue[];
  strengths: string[];
  weaknesses: string[];
  prominentIssues: FeedbackInsightIssue[];
  byActivity: FeedbackInsightByActivity[];
  scope?: string;
  reliability?: {
    reliable: boolean;
    min_valid_feedback_count?: number;
    message?: string;
  };
}
