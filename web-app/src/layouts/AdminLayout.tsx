import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Activity, Bell, CalendarDays, ClipboardList, LayoutDashboard, LogOut, Users } from 'lucide-react';

import { useAuth } from '../auth/useAuth';
import { BrandIcon } from '../components/brand';

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
        <div className="admin-sidebar-brand">
          <span className="admin-brand-mark" aria-hidden="true">
            <BrandIcon />
          </span>
          <div>
            <strong>V-Connect</strong>
            <small>Admin</small>
          </div>
        </div>

        <nav className="admin-sidebar-nav">
          <NavLink className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')} to="/admin/dashboard">
            <LayoutDashboard className="sidebar-link-icon" />
            Dashboard
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')} to="/admin/users">
            <Users className="sidebar-link-icon" />
            User Management
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')} to="/admin/feedback">
            <Activity className="sidebar-link-icon" />
            Feedback
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')} to="/admin/notifications">
            <Bell className="sidebar-link-icon" />
            Notifications
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')} to="/admin/activities">
            <CalendarDays className="sidebar-link-icon" />
            Activities
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')} to="/admin/participations">
            <ClipboardList className="sidebar-link-icon" />
            Participations
          </NavLink>
        </nav>

        <div className="admin-sidebar-bottom">
          <div className="admin-sidebar-help">
            <p>Need Help?</p>
            <small>Check docs or contact support.</small>
          </div>

          <div className="admin-sidebar-profile">
            <span className="admin-profile-avatar">{(profile?.full_name ?? 'A').slice(0, 1).toUpperCase()}</span>
            <div>
              <p className="admin-profile-name">V-Connect Admin</p>
              <small>SUPER ADMIN</small>
            </div>
          </div>

          <button className="sidebar-signout" onClick={handleSignOut} type="button">
            <LogOut className="sidebar-link-icon" />
            Sign Out
          </button>
        </div>
      </aside>

      <section className="admin-content">
        <Outlet />
      </section>
    </main>
  );
}

