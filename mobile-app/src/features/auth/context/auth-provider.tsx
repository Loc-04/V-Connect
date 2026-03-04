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
  subscribeAuthChanges,
  signOut as authSignOut,
} from '../services';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let mounted = true;

    getCurrentSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) {
        setSession(null);
        setStatus('unauthenticated');
        return;
      }
      setSession(data);
      setStatus(data ? 'authenticated' : 'unauthenticated');
    });

    const subscription = subscribeAuthChanges((event, newSession) => {
      if (!mounted) return;

      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        setSession(newSession);
        setStatus('authenticated');
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
        setStatus('unauthenticated');
      } else {
        setSession(newSession);
        setStatus(newSession ? 'authenticated' : 'unauthenticated');
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = useCallback(async () => {
    await authSignOut();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        status,
        session,
        user: session?.user ?? null,
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
