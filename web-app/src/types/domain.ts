export type UserRole = 'admin' | 'organizer' | 'volunteer';

export interface UserRecord {
  id: string;
  role: UserRole | string;
  full_name: string | null;
  email?: string | null;
  phone: string | null;
  avatar_url: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
}

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  role: Exclude<UserRole, 'admin'>;
}

export interface RegisterResult {
  requiresEmailConfirmation: boolean;
  profile: UserRecord | null;
}
