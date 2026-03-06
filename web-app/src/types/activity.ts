export type ActivityStatus = 'draft' | 'published' | 'completed' | 'cancelled';

export interface ActivityLocation {
  address: string;
  city: string;
  lat: number;
  lng: number;
}

export interface ActivityRecord {
  id: string;
  title: string;
  description: string | null;
  location: ActivityLocation | string | null;
  start_time: string;
  end_time: string;
  capacity: number;
  required_skills: string[] | null;
  status: ActivityStatus | string;
  organizer_id: string;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
}

export interface ActivityPayload {
  title: string;
  description: string;
  location: ActivityLocation | string;
  startTime: string;
  endTime: string;
  capacity: number;
  requiredSkills: string[];
  status: ActivityStatus;
}
