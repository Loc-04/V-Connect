export type UserRole = 'admin' | 'organizer' | 'volunteer';

export interface AuthSession {
  userId: string;
  email: string;
  role: UserRole;
  accessToken: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  role: UserRole;
}
