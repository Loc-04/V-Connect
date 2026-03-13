export interface FeedbackRecord {
  id: string;
  participation_id: string;
  volunteer_id: string;
  organizer_id: string | null;
  rating: number;
  comment: string | null;
  created_at: string | null;
}

export interface FeedbackPayload {
  participationId: string;
  rating: number;
  comment: string;
}
