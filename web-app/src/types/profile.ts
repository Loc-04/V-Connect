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

export interface SkillsAvailabilityRecord {
  userId: string;
  skills: string[];
  interests: string[];
  availability: VolunteerAvailability;
  updatedAt: string | null;
}

export interface SkillsAvailabilityResponse {
  skillsAvailability: SkillsAvailabilityRecord;
  message?: string;
}

export interface AvailabilitySlotOption {
  key: keyof VolunteerAvailability;
  label: string;
  description: string;
  days: string[];
  timeWindows: string[];
}

export interface AvailabilityGridRow {
  key: string;
  label: string;
}

export interface AvailabilitySlotsResponse {
  availabilitySlots: AvailabilitySlotOption[];
  availabilityGrid: {
    days: string[];
    rows: AvailabilityGridRow[];
  };
}
