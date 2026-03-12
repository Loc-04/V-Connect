export type ParticipationStatus = 'completed' | 'upcoming' | 'cancelled';

export interface ParticipationRecord {
  id: string;
  participationId: string;
  activityId: string | null;
  activityName: string;
  organization: string;
  date: string | null;
  hours: number | null;
  status: ParticipationStatus;
}

export interface ParticipationResponse {
  participations: ParticipationRecord[];
}

