import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

import { useAuth } from './useAuth';
import { getRoleHomePath } from './rolePaths';
import { normalizeRole, normalizeRoleList } from './roleUtils';

function PageLoading() {
  return (
    <main className="page-wrap">
      <div className="card">
        <p className="muted">Loading session...</p>
      </div>
    </main>
  );
}

export function RoleHomeRedirect() {
  const { loading, error, session, profile } = useAuth();
  const waitingForProfile = Boolean(session && !profile && !error);

  if (loading || waitingForProfile) {
    return <PageLoading />;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!profile) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Navigate to={getRoleHomePath(profile.role)} replace />;
}

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { loading, error, session, profile } = useAuth();
  const waitingForProfile = Boolean(session && !profile && !error);

  if (loading || waitingForProfile) {
    return <PageLoading />;
  }

  if (!session) {
    return <>{children}</>;
  }

  if (!profile) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Navigate to={getRoleHomePath(profile.role)} replace />;
}

export function GuestOnlyRoute({ children }: { children: ReactNode }) {
  const { loading, error, session, profile } = useAuth();
  const location = useLocation();
  const waitingForProfile = Boolean(session && !profile && !error);

  if (loading || waitingForProfile) {
    return <PageLoading />;
  }

  if (!session) {
    return <>{children}</>;
  }

  const normalizedRole = normalizeRole(profile?.role);
  if (!normalizedRole) {
    return <Navigate to="/unauthorized" replace />;
  }

  if (normalizedRole === 'volunteer') {
    const guestActivityMatch = location.pathname.match(/^\/guest\/activity\/([^/]+)$/);
    const fullSuffix = `${location.search}${location.hash}`;

    if (guestActivityMatch?.[1]) {
      return <Navigate to={`/volunteer/activity/${guestActivityMatch[1]}${fullSuffix}`} replace />;
    }

    if (location.pathname === '/guest/browse') {
      return <Navigate to={`/browse${fullSuffix}`} replace />;
    }
  }

  return <Navigate to={getRoleHomePath(normalizedRole)} replace />;
}

export function RequireRoleRoute({
  children,
  allowedRoles,
}: {
  children: ReactNode;
  allowedRoles: string[];
}) {
  const { loading, error, session, profile } = useAuth();
  const location = useLocation();
  const waitingForProfile = Boolean(session && !profile && !error);

  if (loading || waitingForProfile) {
    return <PageLoading />;
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  const normalizedRole = normalizeRole(profile?.role);
  const normalizedAllowedRoles = normalizeRoleList(allowedRoles);
  if (!normalizedRole || !normalizedAllowedRoles.includes(normalizedRole)) {
    return <Navigate to={getRoleHomePath(normalizedRole)} replace />;
  }

  return <>{children}</>;
}

export function RequireAdminRoute({ children }: { children: ReactNode }) {
  return <RequireRoleRoute allowedRoles={['admin']}>{children}</RequireRoleRoute>;
}
