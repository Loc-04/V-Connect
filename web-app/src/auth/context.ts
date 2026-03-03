import type { Session } from '@supabase/supabase-js';
import { createContext } from 'react';

import type { RegisterInput, RegisterResult, UserRecord } from '../types/domain';

export interface AuthContextValue {
  loading: boolean;
  error: string | null;
  session: Session | null;
  profile: UserRecord | null;
  signInWithPassword: (email: string, password: string) => Promise<UserRecord>;
  register: (input: RegisterInput) => Promise<RegisterResult>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
