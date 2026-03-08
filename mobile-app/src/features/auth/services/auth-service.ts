import { supabase } from '@/src/data/clients';
import type { AuthChangeEvent, AuthError, Session, Subscription } from '@supabase/supabase-js';
import type { UserRole } from '../types';

export interface AuthResult<T = void> {
  data: T | null;
  error: string | null;
}

interface SignUpMetadata {
  fullName?: string;
  role?: Exclude<UserRole, 'admin'>;
}

interface UserRoleRow {
  role: string | null;
}

function extractMetadataRole(value: unknown): Exclude<UserRole, 'admin'> | null {
  if (value === 'organizer' || value === 'volunteer') {
    return value;
  }
  return null;
}

function normalizeRole(value: string | null): UserRole | null {
  if (value === 'admin' || value === 'organizer' || value === 'volunteer') {
    return value;
  }
  return null;
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

async function getUserRole(userId: string): Promise<AuthResult<UserRole>> {
  const { data, error } = await supabase.from('users').select('role').eq('id', userId).maybeSingle<UserRoleRow>();
  if (error) return { data: null, error: error.message };
  const role = normalizeRole(data?.role ?? null);
  if (!role) {
    return { data: null, error: 'Your account role is missing. Please contact support.' };
  }
  return { data: role, error: null };
}

async function upsertUserRecord(params: {
  id: string;
  fullName: string;
  role: Exclude<UserRole, 'admin'>;
}): Promise<AuthResult> {
  const { error } = await supabase.from('users').upsert(
    {
      id: params.id,
      full_name: params.fullName,
      role: params.role,
      status: 'active',
    },
    { onConflict: 'id' },
  );
  if (error) {
    return {
      data: null,
      error: 'Account was created, but profile setup failed. Please try signing in again.',
    };
  }
  return { data: null, error: null };
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<AuthResult<Session>> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    return { data: data.session, error: mapError(error) };
  }

  const roleResult = await getUserRole(data.session.user.id);
  if (!roleResult.error) {
    return { data: data.session, error: null };
  }

  const fallbackRole = extractMetadataRole(data.session.user.user_metadata?.role);
  const fallbackFullName =
    typeof data.session.user.user_metadata?.full_name === 'string'
      ? data.session.user.user_metadata.full_name
      : data.session.user.email?.split('@')[0] ?? 'User';

  if (fallbackRole) {
    const bootstrapResult = await upsertUserRecord({
      id: data.session.user.id,
      fullName: fallbackFullName,
      role: fallbackRole,
    });
    if (!bootstrapResult.error) {
      const retriedRole = await getUserRole(data.session.user.id);
      if (!retriedRole.error) {
        return { data: data.session, error: null };
      }
    }
  }

  await supabase.auth.signOut({ scope: 'local' });
  return { data: null, error: roleResult.error };
}

export async function signUpWithEmail(
  email: string,
  password: string,
  metadata?: SignUpMetadata,
): Promise<AuthResult<Session>> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata
        ? {
            full_name: metadata.fullName,
            role: metadata.role,
          }
        : undefined,
    },
  });
  if (error) return { data: null, error: mapError(error) };

  if (!data.user) {
    return { data: null, error: 'Could not create account. Please try again.' };
  }

  if (data.session && metadata?.fullName && metadata.role) {
    const profileResult = await upsertUserRecord({
      id: data.user.id,
      fullName: metadata.fullName,
      role: metadata.role,
    });
    if (profileResult.error) {
      return { data: null, error: profileResult.error };
    }
  }

  // Supabase returns a user with an empty session when email confirmation is required.
  if (data.user && !data.session) {
    return { data: null, error: null };
  }
  return { data: data.session, error: null };
}

export async function signOut(): Promise<AuthResult> {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
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

export async function resolveUserRole(userId: string): Promise<AuthResult<UserRole>> {
  return getUserRole(userId);
}
