import { Link, useNavigate } from 'react-router-dom';

import { normalizeRole } from '../auth/roleUtils';
import { useAuth } from '../auth/useAuth';

export function UnauthorizedPage() {
  const navigate = useNavigate();
  const { profile, signOut, session, error } = useAuth();
  const normalizedRole = normalizeRole(profile?.role) || 'unverified';

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <main className="page-wrap">
      <section className="card auth-card">
        <h1>Access Restricted</h1>
        <p className="muted">
          You do not have access to this page. Your role: {normalizedRole}.
        </p>

        {error && <p className="form-error">{error}</p>}

        {!session && (
          <p className="muted">
            Please <Link to="/login">log in</Link>.
          </p>
        )}

        {session && (
          <button className="danger-btn" onClick={handleSignOut} type="button">
            Sign Out
          </button>
        )}
      </section>
    </main>
  );
}
