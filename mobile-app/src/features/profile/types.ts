export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
  status: string;
}

export interface VolunteerProfile {
  userId: string;
  skills: string[];
  interests: string[];
  availability: Availability;
  totalHours: number;
}

export interface Availability {
  weekdays: boolean;
  weekends: boolean;
  evenings: boolean;
}
