import { Routes, Route, Navigate } from 'react-router-dom';
import HomePage from '../pages/Home';
import LoginPage from '../pages/Login';
import RegisterPage from '../pages/Register';

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/"          element={<HomePage />} />
      <Route path="/login"     element={<LoginPage />} />
      <Route path="/register"  element={<RegisterPage />} />
      <Route path="*"          element={<Navigate to="/" replace />} />
    </Routes>
  );
}
