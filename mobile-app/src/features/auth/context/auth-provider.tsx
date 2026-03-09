import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type PropsWithChildren,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import {
  getCurrentSession,
  resolveUserRole,
  subscribeAuthChanges,
  signOut as authSignOut,
} from '../services';
import type { UserRole } from '../types';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  role: UserRole | null;
  authError: string | null;
  signOut: () => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const clearAuthState = useCallback(() => {
    setSession(null);
    setRole(null);
    setStatus('unauthenticated');
  }, []);

  const resolveSessionRole = useCallback(
    async (nextSession: Session | null) => {
      if (!nextSession) {
        clearAuthState();
        return;
      }

      setStatus('loading');
      setSession(nextSession);
      const { data: resolvedRole, error } = await resolveUserRole(nextSession.user.id);

      if (error || !resolvedRole) {
        setAuthError(error ?? 'Your account role is missing.');
        await authSignOut();
        clearAuthState();
        return;
      }

      setRole(resolvedRole);
      setAuthError(null);
      setStatus('authenticated');
    },
    [clearAuthState],
  );

  useEffect(() => {
    let mounted = true;

    getCurrentSession().then(async ({ data, error }) => {
      if (!mounted) return;
      if (error) {
        clearAuthState();
        setAuthError(error);
        return;
      }
      await resolveSessionRole(data);
    });

    const subscription = subscribeAuthChanges(async (event, newSession) => {
      if (!mounted) return;

      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        await resolveSessionRole(newSession);
      } else if (event === 'SIGNED_OUT') {
        setAuthError(null);
        clearAuthState();
      } else {
        await resolveSessionRole(newSession);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [clearAuthState, resolveSessionRole]);

  const handleSignOut = useCallback(async () => {
    const result = await authSignOut();
    if (result.error) setAuthError(result.error);
    return { error: result.error };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        status,
        session,
        user: session?.user ?? null,
        role,
        authError,
        signOut: handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
