import { Bell, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { VolunteerSidebar, type VolunteerNavKey } from '../components/navigation/VolunteerSidebar';
import './VolunteerShell.css';

interface VolunteerShellProps {
  activeNav: VolunteerNavKey;
  pageTitle: string;
  pageSubtitle: string;
  headerActions?: ReactNode;
  children: ReactNode;
}

function getRoleLabel(role: string | null | undefined): string {
  if (!role) {
    return 'Volunteer';
  }
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function VolunteerShell({ activeNav, pageTitle, pageSubtitle, headerActions, children }: VolunteerShellProps) {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();

  const fullName = profile?.full_name?.trim() || 'Volunteer';
  const roleLabel = getRoleLabel(profile?.role);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="vol-shell">
      <VolunteerSidebar activeKey={activeNav} fullName={fullName} onSignOut={handleSignOut} roleLabel={roleLabel} />

      <section className="vol-shell-main">
        <header className="vol-shell-topbar">
          <div className="vol-shell-topbar-inner">
            <label className="vol-shell-search" htmlFor="vol-shell-search-input">
              <Search className="vol-shell-top-icon" />
              <input id="vol-shell-search-input" placeholder="Search opportunities..." type="search" />
            </label>

            <button
              aria-label="Open notifications"
              className="vol-shell-notify-btn"
              onClick={() => navigate('/volunteer/notifications')}
              type="button"
            >
              <Bell className="vol-shell-top-icon" />
            </button>
          </div>
        </header>

        <div className="vol-shell-body">
          <div className="vol-shell-page-head">
            <div>
              <h1>{pageTitle}</h1>
              <p>{pageSubtitle}</p>
            </div>
            {headerActions && <div className="vol-shell-page-actions">{headerActions}</div>}
          </div>

          {children}
        </div>
      </section>
    </div>
  );
}
