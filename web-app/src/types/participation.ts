export type ParticipationStatus = 'assigned' | 'pending' | 'approved' | 'rejected' | 'cancelled' | 'checked_in' | string;

export interface ParticipationVolunteerSummary {
  id: string;
  role?: string | null;
  full_name: string | null;
  email?: string | null;
  phone: string | null;
  avatar_url: string | null;
}

export interface ParticipationRecord {
  id: string;
  activity_id?: string;
  volunteer_id?: string;
  status: ParticipationStatus;
  ai_match_score?: number | null;
  checked_in_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  volunteer?: ParticipationVolunteerSummary | null;
  participationId: string;
  activityId: string | null;
  activityName: string;
  organization: string;
  date: string | null;
  hours: number | null;
  activityDeleted?: boolean;
  activityDeletedAt?: string | null;
}
