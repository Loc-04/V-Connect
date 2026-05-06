import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AuthProvider } from './auth/AuthContext';
import { GuestOnlyRoute, PublicOnlyRoute, RequireAdminRoute, RequireRoleRoute } from './auth/RouteGuards';
import { getRoleHomePath } from './auth/rolePaths';
import { normalizeRole } from './auth/roleUtils';
import { useAuth } from './auth/useAuth';
import { QuerySyncBridge } from './components/data/QuerySyncBridge';
import { AdminLayout } from './layouts/AdminLayout';
import { AdminActivitiesPage } from './pages/AdminActivitiesPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AdminFeedbackPage } from './pages/AdminFeedbackPage';
import { AdminNotificationsPage } from './pages/AdminNotificationsPage';
import { AdminParticipationsPage } from './pages/AdminParticipationsPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { ActivityDetailPage } from './pages/ActivityDetailPage';
import { CreateActivityPage } from './pages/CreateActivityPage';
import { BrowseOpportunitiesPage } from './pages/BrowseOpportunitiesPage';
import { FeedbackPage } from './pages/FeedbackPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LoginPage } from './pages/LoginPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { OrganizerActivityManagementPage } from './pages/OrganizerActivityManagementPage';
import { OrganizerCheckInManagementPage } from './pages/OrganizerCheckInManagementPage';
import { OrganizerDashboardPage } from './pages/OrganizerDashboardPage';
import { OrganizerNotificationsPage } from './pages/OrganizerNotificationsPage';
import { OrganizerFeedbackReviewPage } from './pages/OrganizerFeedbackReviewPage';
import { OrganizerRecommendationsPage } from './pages/OrganizerRecommendationsPage';
import { OrganizerRegistrationApprovalPage } from './pages/OrganizerRegistrationApprovalPage';
import { OrganizerReportSummaryPage } from './pages/OrganizerReportSummaryPage';
import { ParticipationHistoryPage } from './pages/ParticipationHistoryPage';
import { ProfileSettingsPage } from './pages/ProfileSettingsPage';
import { ProfileUiPage } from './pages/ProfileUiPage';
import { RegisterPage } from './pages/RegisterPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { UnauthorizedPage } from './pages/UnauthorizedPage';
import { GuestActivityDetailPage } from './pages/GuestActivityDetailPage';
import { GuestAboutPage } from './pages/GuestAboutPage';
import { GuestBrowsePage } from './pages/GuestBrowsePage';
import { GuestHomePage } from './pages/GuestHomePage';
import { OrganizerSettingsPage } from './pages/OrganizerSettingsPage';
import { VolunteerAiRecommendedActivitiesPage } from './pages/VolunteerAiRecommendedActivitiesPage';
import { VolunteerHomePage } from './pages/VolunteerHomePage';

function RootRouteEntry() {
  const { loading, error, session, profile } = useAuth();
  const waitingForProfile = Boolean(session && !profile && !error);

  if (loading || waitingForProfile) {
    return (
      <main className="page-wrap">
        <div className="card">
          <p className="muted">Loading session...</p>
        </div>
      </main>
    );
  }

  if (!session) {
    return <GuestHomePage />;
  }

  if (!profile) {
    return <Navigate replace to="/unauthorized" />;
  }

  return <Navigate replace to={getRoleHomePath(profile.role)} />;
}

function FeedbackRouteEntry() {
  const { profile } = useAuth();
  const role = normalizeRole(profile?.role);

  if (role === 'admin') {
    return <Navigate replace to="/admin/feedback" />;
  }

  if (role === 'organizer') {
    return <Navigate replace to="/organizer/feedback" />;
  }

  return <FeedbackPage />;
}

function App() {
  return (
    <AuthProvider>
      <QuerySyncBridge />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRouteEntry />} />
          <Route path="/about" element={<GuestAboutPage />} />
          <Route
            path="/guest/browse"
            element={
              <GuestOnlyRoute>
                <GuestBrowsePage />
              </GuestOnlyRoute>
            }
          />
          <Route
            path="/guest/activity/:id"
            element={
              <GuestOnlyRoute>
                <GuestActivityDetailPage />
              </GuestOnlyRoute>
            }
          />
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
            path="/activities/:id/edit"
            element={
              <RequireRoleRoute allowedRoles={['organizer', 'admin']}>
                <CreateActivityPage />
              </RequireRoleRoute>
            }
          />
          <Route
            path="/browse"
            element={
              <RequireRoleRoute allowedRoles={['volunteer']}>
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
              <RequireRoleRoute allowedRoles={['volunteer']}>
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
            path="/volunteer/profile-settings"
            element={
              <RequireRoleRoute allowedRoles={['volunteer']}>
                <ProfileSettingsPage />
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
            path="/volunteer/ai-recommended-activities"
            element={
              <RequireRoleRoute allowedRoles={['volunteer']}>
                <VolunteerAiRecommendedActivitiesPage />
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
            path="/organizer/activities"
            element={
              <RequireRoleRoute allowedRoles={['organizer']}>
                <OrganizerActivityManagementPage />
              </RequireRoleRoute>
            }
          />
          <Route
            path="/organizer/checkins"
            element={
              <RequireRoleRoute allowedRoles={['organizer']}>
                <OrganizerCheckInManagementPage />
              </RequireRoleRoute>
            }
          />
          <Route
            path="/organizer/registrations"
            element={
              <RequireRoleRoute allowedRoles={['organizer']}>
                <OrganizerRegistrationApprovalPage />
              </RequireRoleRoute>
            }
          />
          <Route
            path="/organizer/feedback"
            element={
              <RequireRoleRoute allowedRoles={['organizer']}>
                <OrganizerFeedbackReviewPage />
              </RequireRoleRoute>
            }
          />
          <Route
            path="/organizer/notifications"
            element={
              <RequireRoleRoute allowedRoles={['organizer']}>
                <OrganizerNotificationsPage />
              </RequireRoleRoute>
            }
          />
          <Route
            path="/organizer/recommendations"
            element={
              <RequireRoleRoute allowedRoles={['organizer']}>
                <OrganizerRecommendationsPage />
              </RequireRoleRoute>
            }
          />
          <Route
            path="/organizer/reports"
            element={
              <RequireRoleRoute allowedRoles={['organizer']}>
                <OrganizerReportSummaryPage />
              </RequireRoleRoute>
            }
          />
          <Route
            path="/organizer/settings"
            element={
              <RequireRoleRoute allowedRoles={['organizer']}>
                <OrganizerSettingsPage />
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
            <Route path="activities" element={<AdminActivitiesPage />} />
            <Route path="dashboard" element={<AdminDashboardPage />} />
            <Route path="feedback" element={<AdminFeedbackPage />} />
            <Route path="notifications" element={<AdminNotificationsPage />} />
            <Route path="participations" element={<AdminParticipationsPage />} />
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
