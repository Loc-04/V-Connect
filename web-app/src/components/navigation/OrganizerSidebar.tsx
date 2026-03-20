import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Bell,
  CalendarCheck2,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Settings,
  Sparkles,
  Users,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';

export type OrganizerNavKey =
  | 'dashboard'
  | 'activities'
  | 'volunteers'
  | 'notifications'
  | 'recommendations'
  | 'assignments'
  | 'reports'
  | 'settings';

interface SidebarItem {
  key: OrganizerNavKey;
  label: string;
  icon: LucideIcon;
  to?: string;
}

const menuItems: SidebarItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: '/organizer/dashboard' },
  { key: 'activities', label: 'Activities', icon: CalendarCheck2, to: '/organizer/activities' },
  { key: 'volunteers', label: 'Volunteers', icon: Users, to: '/organizer/registrations' },
  { key: 'notifications', label: 'Notifications', icon: Bell, to: '/organizer/notifications' },
  { key: 'recommendations', label: 'Recommendations', icon: Sparkles, to: '/organizer/recommendations' },
  { key: 'assignments', label: 'Assignments', icon: ClipboardList },
  { key: 'reports', label: 'Reports', icon: BarChart3, to: '/organizer/reports' },
];

const preferenceItems: SidebarItem[] = [{ key: 'settings', label: 'Settings', icon: Settings }];

interface OrganizerSidebarProps {
  activeKey: OrganizerNavKey;
  fullName: string;
  roleLabel: string;
  avatarUrl?: string | null;
  onSignOut: () => Promise<void>;
}

function SidebarRow({ activeKey, item }: { activeKey: OrganizerNavKey; item: SidebarItem }) {
  const Icon = item.icon;
  const className = item.key === activeKey ? 'org-shell-nav-item is-active' : 'org-shell-nav-item';

  if (!item.to) {
    return (
      <button className={`${className} is-placeholder`} type="button">
        <Icon className="org-shell-nav-icon" />
        <span>{item.label}</span>
      </button>
    );
  }

  return (
    <NavLink className={className} to={item.to}>
      <Icon className="org-shell-nav-icon" />
      <span>{item.label}</span>
    </NavLink>
  );
}

export function OrganizerSidebar({
  activeKey,
  fullName,
  roleLabel,
  avatarUrl,
  onSignOut,
}: OrganizerSidebarProps) {
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <aside className="org-shell-sidebar" aria-label="Organizer navigation">
      <div className="org-shell-brand">
        <span className="org-shell-brand-mark" aria-hidden="true">
          <CalendarCheck2 size={16} />
        </span>
        <div className="org-shell-brand-copy">
          <strong>V-Connect</strong>
          <small>Management</small>
        </div>
      </div>

      <nav className="org-shell-nav" aria-label="Organizer menu">
        {menuItems.map((item) => (
          <SidebarRow activeKey={activeKey} item={item} key={item.key} />
        ))}
      </nav>

      <div className="org-shell-pref-head">Preferences</div>
      <nav className="org-shell-nav" aria-label="Organizer preferences">
        {preferenceItems.map((item) => (
          <SidebarRow activeKey={activeKey} item={item} key={item.key} />
        ))}
      </nav>

      <div className="org-shell-side-footer">
        <div className="org-shell-profile-chip">
          {avatarUrl ? (
            <img alt={fullName} className="org-shell-profile-avatar-img" src={avatarUrl} />
          ) : (
            <span className="org-shell-profile-avatar">{initials || 'O'}</span>
          )}
          <div>
            <strong>{fullName}</strong>
            <small>{roleLabel}</small>
          </div>
        </div>
        <button className="org-shell-signout" onClick={() => void onSignOut()} type="button">
          <LogOut className="org-shell-nav-icon" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
