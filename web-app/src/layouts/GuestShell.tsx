import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

import { BrandIcon } from '../components/brand';
import './GuestShell.css';

type GuestNavKey = 'home' | 'browse' | 'about';

interface GuestShellProps {
  activeNav: GuestNavKey;
  children: ReactNode;
  headerActions?: ReactNode;
  pageTitle?: string;
  pageSubtitle?: string;
}

function toAuthPath(pathname: string, next: string) {
  const params = new URLSearchParams();
  params.set('next', next);
  return `${pathname}?${params.toString()}`;
}

export function GuestShell({ activeNav, children, headerActions, pageTitle, pageSubtitle }: GuestShellProps) {
  const location = useLocation();
  const nextPath = `${location.pathname}${location.search}${location.hash}`;
  const shouldRenderPageHead = Boolean(pageTitle || pageSubtitle || headerActions);

  return (
    <div className="app-shell guest-shell" id="top">
      <header className="guest-shell-header">
        <Link className="guest-shell-brand" to="/">
          <span className="guest-shell-brand-icon" aria-hidden="true">
            <BrandIcon />
          </span>
          <strong>V-Connect</strong>
        </Link>

        <nav className="guest-shell-nav" aria-label="Public navigation">
          <NavLink className={({ isActive }) => (isActive && activeNav === 'home' ? 'guest-shell-link is-active' : 'guest-shell-link')} to="/">
            Home
          </NavLink>
          <NavLink
            className={({ isActive }) => (isActive && activeNav === 'browse' ? 'guest-shell-link is-active' : 'guest-shell-link')}
            to="/guest/browse"
          >
            Browse Activities
          </NavLink>
          <NavLink
            className={({ isActive }) => (isActive && activeNav === 'about' ? 'guest-shell-link is-active' : 'guest-shell-link')}
            to="/about"
          >
            About
          </NavLink>
        </nav>

        <div className="guest-shell-auth-actions">
          <Link className="guest-shell-auth-link" to={toAuthPath('/login', nextPath)}>
            Login
          </Link>
          <Link className="primary-btn guest-shell-signup-btn" to={toAuthPath('/register', nextPath)}>
            Sign Up
          </Link>
        </div>
      </header>

      <main className="content-wrap guest-shell-content">
        {shouldRenderPageHead ? (
          <section className="section-head guest-shell-page-head">
            <div>
              {pageTitle ? <h1>{pageTitle}</h1> : null}
              {pageSubtitle ? <p className="muted">{pageSubtitle}</p> : null}
            </div>
            {headerActions ? <div className="header-actions">{headerActions}</div> : null}
          </section>
        ) : null}
        {children}
      </main>
    </div>
  );
}
