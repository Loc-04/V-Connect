import type { UserRecord } from './domain';

export type VolunteerAvailabilityChoice = string;

export interface VolunteerProfile {
  user_id: string;
  skills: string[] | null;
  interests: string[] | null;
  availableChoices: VolunteerAvailabilityChoice[];
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
  availableChoices: VolunteerAvailabilityChoice[];
  updatedAt: string | null;
}

export interface SkillsAvailabilityResponse {
  skillsAvailability: SkillsAvailabilityRecord;
  message?: string;
}

export interface AvailabilitySlotOption {
  key: VolunteerAvailabilityChoice;
  label: string;
  description: string;
  dayKey: string;
  dayLabel: string;
  sessionKey: string;
  sessionLabel: string;
}

export interface AvailabilityGridRow {
  key: string;
  label: string;
  fullLabel?: string;
}

export interface AvailabilityGridDay {
  key: string;
  label: string;
  fullLabel?: string;
}

export interface AvailabilitySlotsResponse {
  availabilitySlots: AvailabilitySlotOption[];
  availabilityGrid: {
    days: AvailabilityGridDay[];
    rows: AvailabilityGridRow[];
  };
}
