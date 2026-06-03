import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ConfigProvider, theme as antTheme } from 'antd';
import { useAuth } from '../contexts/AuthContext';
import { AdminAuthProvider } from '../admin/contexts/AdminAuthContext';
import AdminRouter from '../admin/router';
import DashboardLayout from '../layouts/DashboardLayout';

// Existing pages (unchanged)
import LoginPage from '../pages/Login';
import RegisterClubPage from '../pages/Register';
import DashboardPage from '../pages/Dashboard';
import SettingsPage from '../pages/Settings';
import UsersPage from '../pages/Users';
import TeamsPage from '../pages/Teams';
import LoansPage from '../pages/Loans';
import AnalyticsPage from '../pages/Analytics';
import AssetNamesPage from '../pages/AssetNames';
import AssetsPage from '../pages/Assets';

import RegisterUserPage from '../pages/RegisterUser';

// Stub pages (replaced by real pages in Tasks 11-21)
const ProfilePage      = () => <div>Profile — coming soon</div>;
const MyClubsPage      = () => <div>My Clubs — coming soon</div>;
const CreateClubPage   = () => <div>Create Club — coming soon</div>;
const WarehousesPage   = () => <div>Warehouses — coming soon</div>;
const KitsPage         = () => <div>Kits — coming soon</div>;
const AuditLogsPage    = () => <div>Audit Logs — coming soon</div>;
const StockPage        = () => <div>Stock Management — coming soon</div>;

function RequireAuth() {
  const { isAuthenticated, isValidating } = useAuth();
  if (isValidating) return null;
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}

function RequireClub() {
  const { activeClub, isValidating } = useAuth();
  if (isValidating) return null;
  return activeClub ? <Outlet /> : <Navigate to="/dashboard" replace />;
}

function RedirectIfAuth() {
  const { isAuthenticated, isValidating } = useAuth();
  if (isValidating) return null;
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <Outlet />;
}

export default function AppRouter() {
  return (
    <Routes>
      <Route element={<RedirectIfAuth />}>
        <Route path="/login"          element={<LoginPage />} />
        <Route path="/register-club"  element={<RegisterClubPage />} />
        <Route path="/register-user"  element={<RegisterUserPage />} />
        {/* legacy redirect */}
        <Route path="/register"       element={<Navigate to="/register-club" replace />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<DashboardLayout />}>
          {/* Personal routes — no club required */}
          <Route path="/dashboard"              element={<DashboardPage />} />
          <Route path="/dashboard/profile"      element={<ProfilePage />} />
          <Route path="/dashboard/clubs"        element={<MyClubsPage />} />
          <Route path="/dashboard/create-club"  element={<CreateClubPage />} />

          {/* Club-scoped routes */}
          <Route element={<RequireClub />}>
            <Route path="/dashboard/warehouses"   element={<WarehousesPage />} />
            <Route path="/dashboard/asset-names"  element={<AssetNamesPage />} />
            <Route path="/dashboard/inventory"    element={<AssetsPage />} />
            <Route path="/dashboard/kits"         element={<KitsPage />} />
            <Route path="/dashboard/loans"        element={<LoansPage />} />
            <Route path="/dashboard/stock"        element={<StockPage />} />
            <Route path="/dashboard/reports"      element={<AnalyticsPage />} />
            <Route path="/dashboard/users"        element={<UsersPage />} />
            <Route path="/dashboard/teams"        element={<TeamsPage />} />
            <Route path="/dashboard/audit-logs"   element={<AuditLogsPage />} />
            <Route path="/dashboard/settings"     element={<SettingsPage />} />
            {/* legacy redirects */}
            <Route path="/dashboard/assets"       element={<Navigate to="/dashboard/inventory" replace />} />
            <Route path="/dashboard/write-offs"   element={<Navigate to="/dashboard/stock" replace />} />
            <Route path="/dashboard/analytics"    element={<Navigate to="/dashboard/reports" replace />} />
          </Route>
        </Route>
      </Route>

      <Route
        path="/admin/*"
        element={
          <ConfigProvider theme={{ algorithm: antTheme.darkAlgorithm }}>
            <AdminAuthProvider>
              <AdminRouter />
            </AdminAuthProvider>
          </ConfigProvider>
        }
      />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
