import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';

export function VolunteerHomePage() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <main className="page-wrap">
      <section className="card auth-card">
        <h1>Volunteer Workspace</h1>
        <p className="muted">
          Welcome {profile?.full_name ?? 'Volunteer'}.
        </p>
        <p className="muted">
          Volunteer web features are being integrated.
        </p>
        <button className="danger-btn" onClick={handleSignOut} type="button">
          Logout
        </button>
      </section>
    </main>
  );
}
