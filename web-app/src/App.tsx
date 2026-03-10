import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AuthProvider } from './auth/AuthContext';
import { PublicOnlyRoute, RequireAdminRoute, RequireRoleRoute, RoleHomeRedirect } from './auth/RouteGuards';
import { AdminLayout } from './layouts/AdminLayout';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { CreateActivityPage } from './pages/CreateActivityPage';
import { BrowseOpportunitiesPage } from './pages/BrowseOpportunitiesPage';
import { FeedbackPage } from './pages/FeedbackPage';
import { LoginPage } from './pages/LoginPage';
import { OrganizerDashboardPage } from './pages/OrganizerDashboardPage';
import { ProfileUiPage } from './pages/ProfileUiPage';
import { RegisterPage } from './pages/RegisterPage';
import { UnauthorizedPage } from './pages/UnauthorizedPage';
import { VolunteerHomePage } from './pages/VolunteerHomePage';

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
                <FeedbackPage />
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
