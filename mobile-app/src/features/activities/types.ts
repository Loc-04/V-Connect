export type ActivityStatus = 'draft' | 'published' | 'completed' | 'cancelled';

export type ParticipationStatus = 'pending' | 'approved' | 'rejected' | 'checked_in';

export interface Activity {
  id: string;
  title: string;
  description: string;
  location: ActivityLocation;
  startTime: string;
  endTime: string;
  capacity: number;
  requiredSkills: string[];
  status: ActivityStatus;
  organizerId: string;
}

export interface ActivityLocation {
  address: string;
  city: string;
  lat: number;
  lng: number;
}

export interface ActivityParticipation {
  id: string;
  activityId: string;
  volunteerId: string;
  status: ParticipationStatus;
  aiMatchScore: number;
  checkedInAt?: string;
}
