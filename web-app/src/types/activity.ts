export type ActivityStatus = 'draft' | 'published' | 'completed' | 'cancelled';
export type ActivityPriorityLevel = 'low' | 'normal' | 'urgent';

export interface SkillRequirement {
  skill: string;
  priority: ActivityPriorityLevel;
}

export interface ActivityLocation {
  address: string;
  city?: string;
  province?: string;
  ward?: string;
  formattedAddress?: string | null;
  mapProvider?: string | null;
  geocodedAt?: string | null;
  geocodeConfidence?: number | null;
  lat?: number | null;
  lng?: number | null;
}

export interface ActivityRecord {
  id: string;
  title: string;
  description: string | null;
  cover_image_url?: string;
  location: ActivityLocation | string | null;
  start_time: string;
  end_time: string;
  capacity: number;
  required_skills: string[] | null;
  status: ActivityStatus | string;
  organizer_id: string;
  province_code?: string | null;
  ward_code?: string | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  priority_level?: ActivityPriorityLevel | string | null;
}

export interface ActivityPayload {
  title: string;
  description: string;
  coverImageUrl: string | null;
  location: ActivityLocation | string;
  provinceCode: string;
  wardCode: string;
  startTime: string;
  endTime: string;
  capacity: number;
  skillRequirements: SkillRequirement[];
  status: ActivityStatus;
}
