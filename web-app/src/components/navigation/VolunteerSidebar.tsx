import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Bell,
  Calendar,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Settings,
  Sparkles,
  User,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { BrandIcon } from '../brand';

export type VolunteerNavKey =
  | 'dashboard'
  | 'activities'
  | 'ai-recommendations'
  | 'my-activities'
  | 'feedback'
  | 'notifications'
  | 'profile'
  | 'settings';

interface SidebarItem {
  key: VolunteerNavKey;
  label: string;
  to: string;
  icon: LucideIcon;
}

const sidebarItems: SidebarItem[] = [
  { key: 'dashboard', label: 'Dashboard', to: '/volunteer/home', icon: LayoutDashboard },
  { key: 'activities', label: 'Activities / Opportunities', to: '/browse', icon: Activity },
  {
    key: 'ai-recommendations',
    label: 'AI Recommended Activities',
    to: '/volunteer/ai-recommended-activities',
    icon: Sparkles,
  },
  { key: 'my-activities', label: 'My Activities', to: '/volunteer/participation-history', icon: Calendar },
  { key: 'feedback', label: 'Feedback', to: '/volunteer/feedback', icon: MessageSquare },
  { key: 'notifications', label: 'Notifications', to: '/volunteer/notifications', icon: Bell },
  { key: 'profile', label: 'Profile', to: '/volunteer/profile-ui', icon: User },
  { key: 'settings', label: 'Settings', to: '/volunteer/profile-settings', icon: Settings },
];

interface VolunteerSidebarProps {
  activeKey: VolunteerNavKey;
  fullName: string;
  roleLabel: string;
  onSignOut: () => Promise<void>;
}

export function VolunteerSidebar({ activeKey, fullName, roleLabel, onSignOut }: VolunteerSidebarProps) {
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <aside className="vol-shell-sidebar" aria-label="Volunteer navigation">
      <div className="vol-shell-brand">
        <span className="vol-shell-brand-mark" aria-hidden="true">
          <BrandIcon />
        </span>
        <span>V-Connect</span>
      </div>

      <nav className="vol-shell-nav">
        {sidebarItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === activeKey;
          return (
            <NavLink
              className={isActive ? 'vol-shell-nav-item is-active' : 'vol-shell-nav-item'}
              key={item.key}
              to={item.to}
            >
              <Icon className="vol-shell-nav-icon" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="vol-shell-side-footer">
        <div className="vol-shell-profile-chip">
          <span className="vol-shell-profile-avatar">{initials || 'V'}</span>
          <div>
            <strong>{fullName}</strong>
            <small>{roleLabel}</small>
          </div>
        </div>
        <button className="vol-shell-signout" onClick={() => void onSignOut()} type="button">
          <LogOut className="vol-shell-nav-icon" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
