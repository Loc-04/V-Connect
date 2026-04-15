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
  ai_moderation_labels?: string[] | null;
  ai_semantic_labels?: string[] | null;
  ai_issue_tags?: string[] | null;
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
    average_rating: number;
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
}
