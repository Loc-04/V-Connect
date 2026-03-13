export interface FeedbackRecord {
  id: string;
  user_id: string;
  rating: number;
  category: string;
  message: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface FeedbackPayload {
  rating: number;
  category?: string;
  message: string;
}
