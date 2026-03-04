import { supabase } from '@/src/data/clients';
import type { AuthChangeEvent, AuthError, Session, Subscription } from '@supabase/supabase-js';

export interface AuthResult<T = void> {
  data: T | null;
  error: string | null;
}

function mapError(err: AuthError | null): string | null {
  if (!err) return null;

  const msg = err.message.toLowerCase();
  if (msg.includes('invalid login credentials')) return 'Incorrect email or password.';
  if (msg.includes('email not confirmed')) return 'Please verify your email before signing in.';
  if (msg.includes('user already registered')) return 'An account with this email already exists.';
  if (msg.includes('signup is disabled')) return 'Registration is currently disabled.';
  if (msg.includes('rate limit')) return 'Too many attempts. Please try again later.';
  if (msg.includes('network')) return 'Network error. Check your connection.';
  return err.message;
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<AuthResult<Session>> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { data: data.session, error: mapError(error) };
}

export async function signUpWithEmail(
  email: string,
  password: string,
  metadata?: { fullName?: string },
): Promise<AuthResult<Session>> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata ? { full_name: metadata.fullName } : undefined,
    },
  });
  if (error) return { data: null, error: mapError(error) };

  // Supabase returns a user with an empty session when email confirmation is required.
  if (data.user && !data.session) {
    return { data: null, error: null };
  }
  return { data: data.session, error: null };
}

export async function signOut(): Promise<AuthResult> {
  const { error } = await supabase.auth.signOut();
  return { data: null, error: mapError(error) };
}

export async function getCurrentSession(): Promise<AuthResult<Session>> {
  const { data, error } = await supabase.auth.getSession();
  return { data: data.session, error: mapError(error) };
}

export function subscribeAuthChanges(
  handler: (event: AuthChangeEvent, session: Session | null) => void,
): Subscription {
  const { data } = supabase.auth.onAuthStateChange(handler);
  return data.subscription;
}
