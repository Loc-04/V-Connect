import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';

export function OrganizerDashboardPage() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <main className="page-wrap">
      <section className="card auth-card">
        <h1>Organizer Workspace</h1>
        <p className="muted">
          Welcome {profile?.full_name ?? 'Organizer'}.
        </p>
        <p className="muted">
          Organizer web features are being integrated.
        </p>
        <button className="danger-btn" onClick={handleSignOut} type="button">
          Logout
        </button>
      </section>
    </main>
  );
}
