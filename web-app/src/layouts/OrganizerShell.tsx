import { Bell, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { OrganizerSidebar, type OrganizerNavKey } from '../components/navigation/OrganizerSidebar';
import './OrganizerShell.css';

interface OrganizerShellProps {
  activeNav: OrganizerNavKey;
  pageTitle: string;
  pageSubtitle?: string;
  pageContext?: ReactNode;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  headerActions?: ReactNode;
  children: ReactNode;
}

function getRoleLabel(role: string | null | undefined): string {
  if (!role) {
    return 'Organizer';
  }
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function OrganizerShell({
  activeNav,
  pageTitle,
  pageSubtitle,
  pageContext,
  searchPlaceholder = 'Search organizer workspace...',
  searchValue,
  onSearchChange,
  headerActions,
  children,
}: OrganizerShellProps) {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();

  const fullName = profile?.full_name?.trim() || 'Organizer';
  const roleLabel = getRoleLabel(profile?.role);
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="org-shell">
      <OrganizerSidebar
        activeKey={activeNav}
        avatarUrl={profile?.avatar_url ?? null}
        fullName={fullName}
        onSignOut={handleSignOut}
        roleLabel={roleLabel}
      />

      <section className="org-shell-main">
        <header className="org-shell-topbar">
          <div className="org-shell-topbar-inner">
            <label className="org-shell-search" htmlFor="org-shell-search-input">
              <Search className="org-shell-top-icon" />
              <input
                id="org-shell-search-input"
                onChange={(event) => onSearchChange?.(event.target.value)}
                placeholder={searchPlaceholder}
                type="search"
                value={searchValue ?? ''}
              />
            </label>

            <div className="org-shell-topbar-right">
              <button aria-label="Notifications" className="org-shell-notify-btn" type="button">
                <Bell className="org-shell-top-icon" />
              </button>
              <span className="org-shell-topbar-divider" aria-hidden="true" />
              <div className="org-shell-topbar-user">
                <div className="org-shell-topbar-user-meta">
                  <strong>{fullName}</strong>
                  <span>{roleLabel}</span>
                </div>

                {profile?.avatar_url ? (
                  <img alt={fullName} className="org-shell-topbar-avatar" src={profile.avatar_url} />
                ) : (
                  <span className="org-shell-topbar-avatar org-shell-topbar-avatar-fallback">{initials || 'O'}</span>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="org-shell-body">
          <div className="org-shell-page-head">
            <div className="org-shell-page-copy">
              {pageContext && <div className="org-shell-page-context">{pageContext}</div>}
              <h1>{pageTitle}</h1>
              {pageSubtitle && <p>{pageSubtitle}</p>}
            </div>
            {headerActions && <div className="org-shell-page-actions">{headerActions}</div>}
          </div>

          {children}
        </div>
      </section>
    </div>
  );
}
