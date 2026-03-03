import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { AuthContext } from './context';
import { apiRequest } from '../lib/api';
import { supabase } from '../lib/supabase';
import type { RegisterInput, RegisterResult, UserRecord } from '../types/domain';

interface MeResponse {
  profile: UserRecord | null;
}

async function fetchUserProfile(accessToken: string): Promise<UserRecord | null> {
  const response = await apiRequest<MeResponse>('/auth/me', { accessToken });
  return response.profile;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserRecord | null>(null);

  useEffect(() => {
    let active = true;

    const syncSession = async (nextSession: Session | null): Promise<void> => {
      if (!active) {
        return;
      }

      setLoading(true);
      setSession(nextSession);

      if (!nextSession) {
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        const nextProfile = await fetchUserProfile(nextSession.access_token);
        if (!active) {
          return;
        }
        setProfile(nextProfile);
        setError(null);
      } catch (syncError) {
        if (!active) {
          return;
        }
        const message = syncError instanceof Error ? syncError.message : 'Failed to load profile from backend.';
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
      await syncSession(data.session);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void syncSession(nextSession);
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

    const nextProfile = await fetchUserProfile(data.session.access_token);
    if (!nextProfile) {
      throw new Error('No profile found in public.users for this account.');
    }

    setSession(data.session);
    setProfile(nextProfile);
    return nextProfile;
  };

  const register = async (input: RegisterInput): Promise<RegisterResult> => {
    setError(null);

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: {
          role: input.role,
          full_name: input.fullName,
          phone: input.phone,
        },
      },
    });

    if (signUpError) {
      throw signUpError;
    }

    const userId = signUpData.user?.id;
    if (!userId) {
      throw new Error('Registration succeeded but no user id was returned.');
    }

    if (signUpData.session) {
      await apiRequest('/auth/register-profile', {
        method: 'POST',
        accessToken: signUpData.session.access_token,
        body: {
          role: input.role,
          fullName: input.fullName,
          phone: input.phone,
        },
      });

      const nextProfile = await fetchUserProfile(signUpData.session.access_token);
      setSession(signUpData.session);
      setProfile(nextProfile);
      return { requiresEmailConfirmation: false, profile: nextProfile };
    }

    return { requiresEmailConfirmation: true, profile: null };
  };

  const signOut = async (): Promise<void> => {
    setError(null);
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      throw signOutError;
    }
    setSession(null);
    setProfile(null);
  };

  const refreshProfile = async (): Promise<void> => {
    if (!session) {
      return;
    }

    try {
      const nextProfile = await fetchUserProfile(session.access_token);
      setProfile(nextProfile);
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
    register,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
