// frontend/src/admin/router/index.tsx
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import AdminLayout from '../layouts/AdminLayout';
import LoginPage          from '../pages/Login';
import DashboardPage      from '../pages/Dashboard';
import AnalyticsPage      from '../pages/Analytics';
import ClubsPage          from '../pages/Clubs';
import ClubDetailPage     from '../pages/ClubDetail';
import AdminSettingsPage  from '../pages/Settings';
import AdminAuditLogsPage from '../pages/AuditLogs';

function RequireAdminAuth() {
  const { isAuthenticated, isValidating, user } = useAdminAuth();
  if (isValidating) return null;
  if (!isAuthenticated || !user?.is_sup_admin) return <Navigate to="/admin/login" replace />;
  return <Outlet />;
}

function RedirectIfAdminAuth() {
  const { isAuthenticated, isValidating, user } = useAdminAuth();
  if (isValidating) return null;
  if (isAuthenticated && user?.is_sup_admin) return <Navigate to="/admin/dashboard" replace />;
  return <Outlet />;
}

export default function AdminRouter() {
  return (
    <Routes>
      <Route element={<RedirectIfAdminAuth />}>
        <Route path="login" element={<LoginPage />} />
      </Route>
      <Route element={<RequireAdminAuth />}>
        <Route element={<AdminLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="clubs"      element={<ClubsPage />} />
          <Route path="clubs/:id"  element={<ClubDetailPage />} />
          <Route path="settings"   element={<AdminSettingsPage />} />
          <Route path="audit-logs" element={<AdminAuditLogsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="login" replace />} />
    </Routes>
  );
}
