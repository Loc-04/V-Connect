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
    const fullDestination = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" state={{ from: fullDestination }} replace />;
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
