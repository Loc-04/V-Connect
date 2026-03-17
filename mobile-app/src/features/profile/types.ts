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

export interface OrganizerProfileView {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  role: ProfileRole;
}

export interface OrganizerTopStats {
  totalEvents: string;
  volunteers: string;
  successRate: string;
}

export type OrganizerActivityBadge = 'open' | 'closed';

export interface OrganizerManagedActivityItem {
  activityId: string;
  title: string;
  joinedVolunteers: number;
  capacity: number;
  badge: OrganizerActivityBadge;
}

export interface OrganizerRecommendedVolunteerItem {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  matchPercent: number;
  tags: string[];
  availabilityLabel: string;
}
