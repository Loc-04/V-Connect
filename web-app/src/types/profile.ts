import type { UserRecord } from './domain';

export interface VolunteerAvailability {
  weekdays: boolean;
  weekends: boolean;
  evenings: boolean;
}

export interface VolunteerProfile {
  user_id: string;
  skills: string[] | null;
  interests: string[] | null;
  availability: VolunteerAvailability | null;
  total_hours: number | null;
  updated_at: string | null;
}

export interface ProfileMeResponse {
  profile: UserRecord | null;
  volunteerProfile: VolunteerProfile | null;
}

