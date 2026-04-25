import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import HomePage from '../pages/Home';
import LoginPage from '../pages/Login';
import RegisterPage from '../pages/Register';
import DashboardLayout from '../layouts/DashboardLayout';
import DashboardPage from '../pages/Dashboard';
import ClubProfilePage from '../pages/ClubProfile';
import UsersPage from '../pages/Users';
import AssetsPage from '../pages/Assets';
import LoansPage from '../pages/Loans';
import WriteOffsPage from '../pages/WriteOffs';

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
          <Route path="/dashboard"       element={<DashboardPage />} />
          <Route path="/dashboard/club"  element={<ClubProfilePage />} />
          <Route path="/dashboard/assets" element={<AssetsPage />} />
          <Route path="/dashboard/loans"       element={<LoansPage />} />
          <Route path="/dashboard/write-offs"  element={<WriteOffsPage />} />
          <Route path="/dashboard/users"       element={<UsersPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
