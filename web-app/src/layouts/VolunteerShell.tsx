import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { getRoleLabel } from '../auth/roleUtils';
import { useAuth } from '../auth/useAuth';
import { VolunteerSidebar, type VolunteerNavKey } from '../components/navigation/VolunteerSidebar';
import { NotificationDropdown } from '../components/notifications/NotificationDropdown';
import './VolunteerShell.css';

interface VolunteerShellProps {
  activeNav: VolunteerNavKey;
  pageEyebrow?: string;
  pageTitle: string;
  pageSubtitle: string;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  showSearch?: boolean;
  headerActions?: ReactNode;
  children: ReactNode;
}

export function VolunteerShell({
  activeNav,
  pageEyebrow,
  pageTitle,
  pageSubtitle,
  searchPlaceholder = 'Search opportunities...',
  searchValue,
  onSearchChange,
  showSearch,
  headerActions,
  children,
}: VolunteerShellProps) {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();

  const fullName = profile?.full_name?.trim() || 'Volunteer';
  const roleLabel = getRoleLabel(profile?.role, 'Volunteer');
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  const canSearch = showSearch ?? true;

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="vol-shell">
      <VolunteerSidebar
        activeKey={activeNav}
        fullName={fullName}
        onSignOut={handleSignOut}
        roleLabel={roleLabel}
        avatarUrl={profile?.avatar_url ?? null}
      />

      <section className="vol-shell-main">
        <header className="vol-shell-topbar">
          <div className="vol-shell-topbar-inner">
            {canSearch ? (
              <label className="vol-shell-search" htmlFor="vol-shell-search-input">
                <Search className="vol-shell-top-icon" />
                <input
                  id="vol-shell-search-input"
                  onChange={(event) => onSearchChange?.(event.target.value)}
                  placeholder={searchPlaceholder}
                  type="search"
                  value={searchValue ?? ''}
                />
              </label>
            ) : (
              <div aria-hidden="true" />
            )}

            <div className="vol-shell-topbar-right">
              <NotificationDropdown />
              <span className="vol-shell-topbar-divider" aria-hidden="true" />
              <div className="vol-shell-topbar-user">
                <div className="vol-shell-topbar-user-meta">
                  <strong>{fullName}</strong>
                  <span>{roleLabel}</span>
                </div>

                {profile?.avatar_url ? (
                  <img alt={fullName} className="vol-shell-topbar-avatar" src={profile.avatar_url} />
                ) : (
                  <span className="vol-shell-topbar-avatar vol-shell-topbar-avatar-fallback">{initials || 'V'}</span>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="vol-shell-body">
          <div className="vol-shell-page-head">
            <div>
              {pageEyebrow && <p className="vol-shell-page-eyebrow">{pageEyebrow}</p>}
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
