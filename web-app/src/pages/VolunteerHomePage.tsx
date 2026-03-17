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
        <p className="muted">Welcome {profile?.full_name ?? 'Volunteer'}.</p>
        <p className="muted">Pick a feature:</p>

        <div className="header-actions">
          <button className="secondary-btn" onClick={() => navigate('/browse')} type="button">
            Browse Activities
          </button>
          <button
            className="secondary-btn"
            onClick={() => navigate('/volunteer/ai-recommended-activities')}
            type="button"
          >
            AI Recommended Activities
          </button>
          <button className="secondary-btn" onClick={() => navigate('/feedback')} type="button">
            Feedback
          </button>
          <button
            className="secondary-btn"
            onClick={() => navigate('/volunteer/participation-history')}
            type="button"
          >
            Participation history
          </button>
          <button className="secondary-btn" onClick={() => navigate('/volunteer/profile-ui')} type="button">
            Profile settings
          </button>
        </div>
        <button className="danger-btn" onClick={handleSignOut} type="button">
          Logout
        </button>
      </section>
    </main>
  );
}
