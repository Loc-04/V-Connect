import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

import { useAuth } from './useAuth';

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
  const { loading, session, profile } = useAuth();

  if (loading) {
    return <PageLoading />;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!profile) {
    return <Navigate to="/unauthorized" replace />;
  }

  if (profile.role === 'admin') {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return <Navigate to="/unauthorized" replace />;
}

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { loading, session, profile } = useAuth();

  if (loading) {
    return <PageLoading />;
  }

  if (!session) {
    return <>{children}</>;
  }

  if (profile?.role === 'admin') {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return <Navigate to="/unauthorized" replace />;
}

export function RequireAdminRoute({ children }: { children: ReactNode }) {
  const { loading, session, profile } = useAuth();
  const location = useLocation();

  if (loading) {
    return <PageLoading />;
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (!profile || profile.role !== 'admin') {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}
