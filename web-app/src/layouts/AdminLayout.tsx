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
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-profile">
          <span className="admin-profile-avatar">{(profile?.full_name ?? 'A').slice(0, 1).toUpperCase()}</span>
          <div>
            <p className="admin-profile-name">V-Connect Admin</p>
            <small>SUPER ADMIN</small>
          </div>
        </div>

        <nav className="admin-sidebar-nav">
          <NavLink className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')} to="/admin/dashboard">
            Dashboard
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')} to="/admin/users">
            User Management
          </NavLink>
          <button className="sidebar-link placeholder" type="button">
            Volunteer Opportunities
          </button>
          <button className="sidebar-link placeholder" type="button">
            Reports
          </button>
          <button className="sidebar-link placeholder" type="button">
            Settings
          </button>
        </nav>

        <div className="admin-sidebar-help">
          <p>Need Help?</p>
          <small>Check docs or contact support.</small>
        </div>

        <button className="sidebar-signout" onClick={handleSignOut} type="button">
          Sign Out
        </button>
      </aside>

      <section className="admin-content">
        <Outlet />
      </section>
    </main>
  );
}
