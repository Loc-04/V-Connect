export type UserRole = 'admin' | 'organizer' | 'volunteer';
export type RegistrationRole = Exclude<UserRole, 'admin'>;

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
  role: RegistrationRole;
  phone: string;
}
