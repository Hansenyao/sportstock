// frontend/src/admin/contexts/AdminAuthContext.tsx
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { AuthUser } from '../../types';
import axios from 'axios';

const TOKEN_KEY = 'admin_token';
const USER_KEY  = 'admin_user';

interface AdminAuthContextValue {
  user: AuthUser | null;
  token: string | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isValidating: boolean;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

function clearStorage() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser]   = useState<AuthUser | null>(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null'); } catch { return null; }
  });
  const [isValidating, setIsValidating] = useState<boolean>(!!localStorage.getItem(TOKEN_KEY));

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) return;
    axios
      .get<AuthUser>(
        `${import.meta.env.VITE_API_BASE_URL || '/api/v1'}/auth/me`,
        { headers: { Authorization: `Bearer ${stored}` } }
      )
      .then(res => {
        if (!res.data.is_sup_admin) { clearStorage(); setToken(null); setUser(null); return; }
        localStorage.setItem(USER_KEY, JSON.stringify(res.data));
        setUser(res.data);
      })
      .catch(() => { clearStorage(); setToken(null); setUser(null); })
      .finally(() => setIsValidating(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback((newToken: string, newUser: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => { clearStorage(); setToken(null); setUser(null); }, []);

  return (
    <AdminAuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token, isValidating }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}
