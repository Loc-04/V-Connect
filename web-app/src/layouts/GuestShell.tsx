import type { ReactNode } from 'react';
import { Activity } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';

import './GuestShell.css';

type GuestNavKey = 'home' | 'browse';

interface GuestShellProps {
  activeNav: GuestNavKey;
  pageTitle: string;
  pageSubtitle: string;
  headerActions?: ReactNode;
  children: ReactNode;
}

function toAuthPath(pathname: string, next: string) {
  const params = new URLSearchParams();
  params.set('next', next);
  return `${pathname}?${params.toString()}`;
}

export function GuestShell({ activeNav, pageTitle, pageSubtitle, headerActions, children }: GuestShellProps) {
  const location = useLocation();
  const nextPath = `${location.pathname}${location.search}${location.hash}`;

  return (
    <div className="app-shell guest-shell">
      <header className="app-header guest-shell-header">
        <div className="guest-shell-brand-wrap">
          <span className="guest-shell-brand-icon" aria-hidden="true">
            <Activity size={16} />
          </span>
          <div>
            <strong>V-Connect</strong>
            <p>Continue as Guest</p>
          </div>
        </div>

        <nav className="guest-shell-nav" aria-label="Guest navigation">
          <NavLink className={activeNav === 'home' ? 'nav-link active' : 'nav-link'} to="/">
            Home
          </NavLink>
          <NavLink className={activeNav === 'browse' ? 'nav-link active' : 'nav-link'} to="/guest/browse">
            Browse Activities
          </NavLink>
        </nav>

        <div className="guest-shell-auth-actions">
          <Link className="secondary-btn" to={toAuthPath('/login', nextPath)}>
            Sign In
          </Link>
          <Link className="primary-btn" to={toAuthPath('/register', nextPath)}>
            Sign Up
          </Link>
        </div>
      </header>

      <main className="content-wrap guest-shell-content">
        <section className="section-head guest-shell-page-head">
          <div>
            <h1>{pageTitle}</h1>
            <p className="muted">{pageSubtitle}</p>
          </div>
          {headerActions && <div className="header-actions">{headerActions}</div>}
        </section>
        {children}
      </main>
    </div>
  );
}
