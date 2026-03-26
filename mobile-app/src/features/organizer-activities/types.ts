export type ActivityStatus = 'draft' | 'published' | 'completed' | 'cancelled';

export interface ActivityLocation {
  address: string;
  city: string;
  lat: number;
  lng: number;
}

/** Shape returned by GET /activities and GET /activities/:id */
export interface ActivityRecord {
  id: string;
  title: string;
  description: string;
  location: ActivityLocation;
  start_time: string;
  end_time: string;
  capacity: number;
  required_skills: string[];
  status: ActivityStatus;
  organizer_id: string;
  province_code: string | null;
  ward_code: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Shape sent to POST /activities (full) and PATCH /activities/:id (partial) */
export interface ActivityPayload {
  title: string;
  description: string;
  location: string | ActivityLocation;
  startTime: string;
  endTime: string;
  capacity: number;
  requiredSkills: string[];
  status: ActivityStatus;
  provinceCode?: string;
  wardCode?: string;
}
