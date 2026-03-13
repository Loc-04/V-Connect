import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AuthProvider } from './auth/AuthContext';
import { PublicOnlyRoute, RequireAdminRoute, RequireRoleRoute, RoleHomeRedirect } from './auth/RouteGuards';
import { useAuth } from './auth/useAuth';
import { AdminLayout } from './layouts/AdminLayout';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AdminFeedbackPage } from './pages/AdminFeedbackPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { ActivityDetailPage } from './pages/ActivityDetailPage';
import { CreateActivityPage } from './pages/CreateActivityPage';
import { BrowseOpportunitiesPage } from './pages/BrowseOpportunitiesPage';
import { FeedbackPage } from './pages/FeedbackPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LoginPage } from './pages/LoginPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { OrganizerDashboardPage } from './pages/OrganizerDashboardPage';
import { ParticipationHistoryPage } from './pages/ParticipationHistoryPage';
import { ProfileUiPage } from './pages/ProfileUiPage';
import { RegisterPage } from './pages/RegisterPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { UnauthorizedPage } from './pages/UnauthorizedPage';
import { VolunteerHomePage } from './pages/VolunteerHomePage';

function FeedbackRouteEntry() {
  const { profile } = useAuth();
  const role = String(profile?.role ?? '');

  if (role === 'admin') {
    return <Navigate replace to="/admin/feedback" />;
  }

  if (role === 'organizer') {
    return <AdminFeedbackPage />;
  }

  return <FeedbackPage />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RoleHomeRedirect />} />
          <Route
            path="/login"
            element={
              <PublicOnlyRoute>
                <LoginPage />
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicOnlyRoute>
                <RegisterPage />
              </PublicOnlyRoute>
            }
          />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/activities/create"
            element={
              <RequireRoleRoute allowedRoles={['organizer', 'admin']}>
                <CreateActivityPage />
              </RequireRoleRoute>
            }
          />
          <Route
            path="/browse"
            element={
              <RequireRoleRoute allowedRoles={['volunteer', 'organizer', 'admin']}>
                <BrowseOpportunitiesPage />
              </RequireRoleRoute>
            }
          />
          <Route
            path="/feedback"
            element={
              <RequireRoleRoute allowedRoles={['volunteer', 'organizer', 'admin']}>
                <FeedbackRouteEntry />
              </RequireRoleRoute>
            }
          />
          <Route
            path="/volunteer/participation-history"
            element={
              <RequireRoleRoute allowedRoles={['volunteer']}>
                <ParticipationHistoryPage />
              </RequireRoleRoute>
            }
          />
          <Route
            path="/volunteer/activity/:id"
            element={
              <RequireRoleRoute allowedRoles={['volunteer', 'organizer', 'admin']}>
                <ActivityDetailPage />
              </RequireRoleRoute>
            }
          />

          <Route path="/unauthorized" element={<UnauthorizedPage />} />

          <Route
            path="/volunteer/home"
            element={
              <RequireRoleRoute allowedRoles={['volunteer']}>
                <VolunteerHomePage />
              </RequireRoleRoute>
            }
          />

          <Route
            path="/volunteer/profile-ui"
            element={
              <RequireRoleRoute allowedRoles={['volunteer']}>
                <ProfileUiPage />
              </RequireRoleRoute>
            }
          />
          <Route
            path="/volunteer/feedback"
            element={
              <RequireRoleRoute allowedRoles={['volunteer']}>
                <FeedbackPage />
              </RequireRoleRoute>
            }
          />
          <Route
            path="/volunteer/notifications"
            element={
              <RequireRoleRoute allowedRoles={['volunteer']}>
                <NotificationsPage />
              </RequireRoleRoute>
            }
          />

          <Route
            path="/organizer/dashboard"
            element={
              <RequireRoleRoute allowedRoles={['organizer']}>
                <OrganizerDashboardPage />
              </RequireRoleRoute>
            }
          />

          <Route
            path="/admin"
            element={
              <RequireAdminRoute>
                <AdminLayout />
              </RequireAdminRoute>
            }
          >
            <Route path="dashboard" element={<AdminDashboardPage />} />
            <Route path="feedback" element={<AdminFeedbackPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
