import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ConfigProvider, theme as antTheme } from 'antd';
import { useAuth } from '../contexts/AuthContext';
import { AdminAuthProvider } from '../admin/contexts/AdminAuthContext';
import AdminRouter from '../admin/router';
import HomePage from '../pages/Home';
import LoginPage from '../pages/Login';
import RegisterPage from '../pages/Register';
import DashboardLayout from '../layouts/DashboardLayout';
import DashboardPage from '../pages/Dashboard';
import SettingsPage from '../pages/Settings';
import UsersPage from '../pages/Users';
import TeamsPage from '../pages/Teams';
import AssetNamesPage from '../pages/AssetNames';
import AssetsPage from '../pages/Assets';
import LoansPage from '../pages/Loans';
import WriteOffsPage from '../pages/WriteOffs';
import AnalyticsPage from '../pages/Analytics';

function RequireAuth() {
  const { isAuthenticated, isValidating } = useAuth();
  if (isValidating) return null;
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}

function RedirectIfAuth() {
  const { isAuthenticated, isValidating } = useAuth();
  if (isValidating) return null;
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <Outlet />;
}

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />

      <Route element={<RedirectIfAuth />}>
        <Route path="/login"    element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard"             element={<DashboardPage />} />
          <Route path="/dashboard/settings"    element={<SettingsPage />} />
          <Route path="/dashboard/asset-names" element={<AssetNamesPage />} />
          <Route path="/dashboard/assets"      element={<AssetsPage />} />
          <Route path="/dashboard/loans"       element={<LoansPage />} />
          <Route path="/dashboard/write-offs"  element={<WriteOffsPage />} />
          <Route path="/dashboard/analytics"   element={<AnalyticsPage />} />
          <Route path="/dashboard/users"       element={<UsersPage />} />
          <Route path="/dashboard/teams"       element={<TeamsPage />} />
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

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
