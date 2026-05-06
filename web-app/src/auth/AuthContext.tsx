import type { Session } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { AuthContext } from './context';
import { apiRequest } from '../lib/api';
import { supabase } from '../lib/supabase';
import type { RegisterInput, RegisterResult, UserRecord } from '../types/domain';

interface MeResponse {
  profile: UserRecord | null;
}

interface RegisterApiResponse {
  success: boolean;
  requiresEmailConfirmation?: boolean;
  profile?: UserRecord | null;
}

interface ProfileSeed {
  role: 'volunteer' | 'organizer';
  fullName: string;
  phone: string;
}

const PROFILE_FETCH_MAX_ATTEMPTS = 8;
const PROFILE_FETCH_RETRY_DELAY_MS = 250;
const PROFILE_CACHE_KEY_PREFIX = 'vconnect.profile-cache:';
const SUPABASE_AUTH_STORAGE_SUFFIX = '-auth-token';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function getProfileCacheKey(userId: string): string {
  return `${PROFILE_CACHE_KEY_PREFIX}${userId}`;
}

function readCachedProfile(userId: string): UserRecord | null {
  if (!isBrowser()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getProfileCacheKey(userId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.id !== 'string') {
      return null;
    }

    return parsed as UserRecord;
  } catch {
    return null;
  }
}

function writeCachedProfile(profile: UserRecord | null): void {
  if (!isBrowser() || !profile?.id) {
    return;
  }

  window.localStorage.setItem(getProfileCacheKey(profile.id), JSON.stringify(profile));
}

function clearCachedProfile(userId: string | null | undefined): void {
  if (!isBrowser() || !userId) {
    return;
  }

  window.localStorage.removeItem(getProfileCacheKey(userId));
}

function deriveSupabaseStorageKey(): string | null {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    if (!supabaseUrl) {
      return null;
    }

    const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
    return projectRef ? `sb-${projectRef}${SUPABASE_AUTH_STORAGE_SUFFIX}` : null;
  } catch {
    return null;
  }
}

function extractStoredSession(candidate: unknown): Session | null {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const value = candidate as Record<string, unknown>;

  if (
    typeof value.access_token === 'string' &&
    value.user &&
    typeof value.user === 'object' &&
    typeof (value.user as Record<string, unknown>).id === 'string'
  ) {
    return candidate as unknown as Session;
  }

  if ('currentSession' in value) {
    return extractStoredSession(value.currentSession);
  }

  if ('session' in value) {
    return extractStoredSession(value.session);
  }

  return null;
}

function readStoredSession(): Session | null {
  if (!isBrowser()) {
    return null;
  }

  const preferredKey = deriveSupabaseStorageKey();
  const keys = preferredKey
    ? [preferredKey, ...Object.keys(window.localStorage).filter((key) => key !== preferredKey)]
    : Object.keys(window.localStorage);

  for (const key of keys) {
    if (!key.endsWith(SUPABASE_AUTH_STORAGE_SUFFIX)) {
      continue;
    }

    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        continue;
      }

      const parsed = JSON.parse(raw);
      const session = extractStoredSession(parsed);
      if (session) {
        return session;
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function fetchUserProfile(accessToken: string): Promise<UserRecord | null> {
  const response = await apiRequest<MeResponse>('/auth/me', { accessToken });
  return response.profile;
}

async function fetchUserProfileWithRetry(accessToken: string): Promise<UserRecord | null> {
  for (let attempt = 1; attempt <= PROFILE_FETCH_MAX_ATTEMPTS; attempt += 1) {
    const profile = await fetchUserProfile(accessToken);
    if (profile) {
      return profile;
    }

    if (attempt < PROFILE_FETCH_MAX_ATTEMPTS) {
      await delay(PROFILE_FETCH_RETRY_DELAY_MS);
    }
  }

  return null;
}

function extractProfileSeed(session: Session): ProfileSeed | null {
  const metadata = session.user.user_metadata ?? {};
  const role = typeof metadata.role === 'string' ? metadata.role.trim().toLowerCase() : '';
  const fullName = typeof metadata.full_name === 'string' ? metadata.full_name.trim() : '';
  const phone = typeof metadata.phone === 'string' ? metadata.phone.trim() : '';

  if ((role !== 'volunteer' && role !== 'organizer') || !fullName || !phone) {
    return null;
  }

  return { role, fullName, phone };
}

function buildProfileSeed(session: Session): UserRecord | null {
  const metadata = session.user.user_metadata ?? {};
  const metadataRole = typeof metadata.role === 'string' ? metadata.role.trim().toLowerCase() : '';
  const appRole = typeof session.user.app_metadata?.role === 'string' ? session.user.app_metadata.role.trim().toLowerCase() : '';
  const role = metadataRole || appRole;

  if (role !== 'volunteer' && role !== 'organizer' && role !== 'admin') {
    return null;
  }

  const fullName = typeof metadata.full_name === 'string' ? metadata.full_name.trim() : null;
  const phone =
    typeof metadata.phone === 'string'
      ? metadata.phone.trim()
      : typeof session.user.phone === 'string'
        ? session.user.phone.trim()
        : null;
  const avatarUrl = typeof metadata.avatar_url === 'string' ? metadata.avatar_url.trim() : null;

  return {
    id: session.user.id,
    role,
    full_name: fullName || null,
    phone: phone || null,
    avatar_url: avatarUrl || null,
    status: 'active',
    created_at: session.user.created_at ?? null,
    updated_at: null,
    deleted_at: null,
  };
}

function getHydratedAuthState(): { session: Session | null; profile: UserRecord | null } {
  const session = readStoredSession();
  if (!session) {
    return { session: null, profile: null };
  }

  return {
    session,
    profile: readCachedProfile(session.user.id) ?? buildProfileSeed(session),
  };
}

async function ensureProfile(accessToken: string, session: Session): Promise<UserRecord | null> {
  let profile = await fetchUserProfileWithRetry(accessToken);
  if (profile) {
    return profile;
  }

  const seed = extractProfileSeed(session);
  if (!seed) {
    return null;
  }

  await apiRequest('/auth/register-profile', {
    method: 'POST',
    accessToken,
    body: seed,
  });

  profile = await fetchUserProfileWithRetry(accessToken);
  return profile;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const hydratedState = getHydratedAuthState();
  const [loading, setLoading] = useState(!hydratedState.session && !hydratedState.profile);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(hydratedState.session);
  const [profile, setProfile] = useState<UserRecord | null>(hydratedState.profile);
  const sessionRef = useRef<Session | null>(hydratedState.session);
  const profileRef = useRef<UserRecord | null>(hydratedState.profile);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    let active = true;

    const syncSession = async (nextSession: Session | null, background = false): Promise<void> => {
      if (!active) {
        return;
      }

      const currentSession = sessionRef.current;
      const currentProfile = profileRef.current;
      const sameUser = Boolean(currentSession && nextSession && currentSession.user.id === nextSession.user.id);
      const keepVisibleProfile = Boolean(background && sameUser && currentProfile);

      if (!keepVisibleProfile) {
        setLoading(true);
      }

      setError(null);
      setSession(nextSession);

      if (!nextSession) {
        clearCachedProfile(currentSession?.user.id);
        setProfile(null);
        setLoading(false);
        return;
      }

      const cachedProfile = readCachedProfile(nextSession.user.id) ?? buildProfileSeed(nextSession);
      if (cachedProfile) {
        setProfile(cachedProfile);
      }

      try {
        const nextProfile = await ensureProfile(nextSession.access_token, nextSession);
        if (!active) {
          return;
        }

        if (!nextProfile) {
          clearCachedProfile(nextSession.user.id);
          setProfile(null);
          setError('No profile found in public.users for this account.');
          return;
        }

        setProfile(nextProfile);
        writeCachedProfile(nextProfile);
        setError(null);
      } catch (syncError) {
        if (!active) {
          return;
        }
        const message = syncError instanceof Error ? syncError.message : 'Failed to load profile from backend.';
        if (!profileRef.current) {
          setProfile(cachedProfile ?? null);
        }
        setError(message);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void (async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError && active) {
        setError(sessionError.message);
      }
      await syncSession(data.session, true);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void syncSession(nextSession, true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithPassword = async (email: string, password: string): Promise<UserRecord> => {
    setError(null);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      throw signInError;
    }

    if (!data.user) {
      throw new Error('Sign-in succeeded but no user object was returned.');
    }

    if (!data.session) {
      throw new Error('Sign-in succeeded but no active session was returned.');
    }

    const nextProfile = await ensureProfile(data.session.access_token, data.session);
    if (!nextProfile) {
      throw new Error('No profile found in public.users for this account.');
    }

    setSession(data.session);
    setProfile(nextProfile);
    writeCachedProfile(nextProfile);
    setLoading(false);
    return nextProfile;
  };

  const signInWithGoogle = async (): Promise<void> => {
    setError(null);

    const redirectTo = `${window.location.origin}/login${window.location.search}`;
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
      },
    });

    if (signInError) {
      throw signInError;
    }
  };

  const register = async (input: RegisterInput): Promise<RegisterResult> => {
    setError(null);
    const response = await apiRequest<RegisterApiResponse>('/auth/register', {
      method: 'POST',
      body: {
        email: input.email,
        password: input.password,
        confirmPassword: input.password,
        fullName: input.fullName,
        phone: input.phone,
        role: input.role,
      },
    });

    if (!response.success) {
      throw new Error('Registration failed. Please try again.');
    }

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });

    if (!signInError && data.session) {
      const nextProfile = await ensureProfile(data.session.access_token, data.session);
      setSession(data.session);
      setProfile(nextProfile);
      writeCachedProfile(nextProfile);
      setLoading(false);
      return { requiresEmailConfirmation: false, profile: nextProfile };
    }

    if (signInError) {
      throw new Error(`Account created, but automatic sign-in failed: ${signInError.message}`);
    }

    return {
      requiresEmailConfirmation: response.requiresEmailConfirmation ?? false,
      profile: response.profile ?? null,
    };
  };

  const signOut = async (): Promise<void> => {
    setError(null);
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      throw signOutError;
    }
    setSession(null);
    setProfile(null);
    clearCachedProfile(sessionRef.current?.user.id);
  };

  const refreshProfile = async (): Promise<void> => {
    if (!session) {
      return;
    }

    try {
      const nextProfile = await fetchUserProfile(session.access_token);
      setProfile(nextProfile);
      writeCachedProfile(nextProfile);
      setError(null);
    } catch (refreshError) {
      const message =
        refreshError instanceof Error ? refreshError.message : 'Failed to refresh profile from backend.';
      setError(message);
    }
  };

  const value = {
    loading,
    error,
    session,
    profile,
    signInWithPassword,
    signInWithGoogle,
    register,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
