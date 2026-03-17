export type ProfileRole = 'admin' | 'organizer' | 'volunteer';

export type AvailabilityDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type AvailabilityMap = Record<AvailabilityDay, boolean>;

export interface VolunteerAvailability {
  days: AvailabilityMap;
  note: string | null;
}

export interface VolunteerProfileView {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  role: ProfileRole;
  memberSince: string;
  skills: string[];
  interests: string[];
  availability: VolunteerAvailability;
}

export interface ProfileStats {
  activitiesCount: number;
  totalHours: number;
  impactScore: number;
}

export interface RecentParticipationItem {
  participationId: string;
  activityId: string;
  title: string;
  organizerName: string | null;
  dateLabel: string;
  hoursLabel: string;
  isTopRated: boolean;
}

export interface CoreSkillOption {
  id: string;
  skillName: string;
}
