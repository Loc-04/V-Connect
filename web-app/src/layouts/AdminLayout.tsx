import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';

export function AdminLayout() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="badge">V-Connect Admin</p>
          <h1>Admin Workspace</h1>
          <p className="muted">{profile?.full_name ?? 'Admin'} · {profile?.id}</p>
        </div>

        <div className="header-actions">
          <NavLink
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            to="/admin/dashboard"
          >
            Dashboard
          </NavLink>
          <NavLink
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            to="/admin/users"
          >
            Users
          </NavLink>
          <button className="danger-btn" onClick={handleSignOut} type="button">
            Logout
          </button>
        </div>
      </header>

      <section className="content-wrap">
        <Outlet />
      </section>
    </main>
  );
}
