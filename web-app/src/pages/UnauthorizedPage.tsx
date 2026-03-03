import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';

export function UnauthorizedPage() {
  const navigate = useNavigate();
  const { profile, signOut, session } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <main className="page-wrap">
      <section className="card auth-card">
        <h1>Access Restricted</h1>
        <p className="muted">
          This web workspace currently serves admin pages only. Your role: {profile?.role ?? 'unknown'}.
        </p>

        {!session && (
          <p className="muted">
            Please <Link to="/login">log in</Link>.
          </p>
        )}

        {session && (
          <button className="danger-btn" onClick={handleSignOut} type="button">
            Logout
          </button>
        )}
      </section>
    </main>
  );
}
