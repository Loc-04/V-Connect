import type { AuthError, Session, User } from '@supabase/supabase-js';
import { supabase } from '@/src/data/clients';

export interface AuthRepositoryResult<T> {
  data: T | null;
  error: AuthError | null;
}

export interface SignUpPayload {
  email: string;
  password: string;
  metadata?: {
    fullName?: string;
  };
}

export interface SignInPayload {
  email: string;
  password: string;
}

export async function signIn(
  payload: SignInPayload,
): Promise<AuthRepositoryResult<Session>> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: payload.email,
    password: payload.password,
  });

  return { data: data.session, error };
}

export async function signUp(
  payload: SignUpPayload,
): Promise<AuthRepositoryResult<{ user: User | null; session: Session | null }>> {
  const { data, error } = await supabase.auth.signUp({
    email: payload.email,
    password: payload.password,
    options: {
      data: payload.metadata ? { full_name: payload.metadata.fullName } : undefined,
    },
  });

  return { data: { user: data.user, session: data.session }, error };
}

export async function signOut(): Promise<AuthRepositoryResult<void>> {
  const { error } = await supabase.auth.signOut();
  return { data: null, error };
}
