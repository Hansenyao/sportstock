import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { AuthUser } from '../types';
import axios from 'axios';

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isValidating: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function clearStorage() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem('user');
    try { return stored ? JSON.parse(stored) : null; } catch { return null; }
  });
  // true while we're verifying the stored token on startup
  const [isValidating, setIsValidating] = useState<boolean>(!!localStorage.getItem('token'));

  // Verify stored token against the server on first mount
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) return;

    axios
      .get<AuthUser>(
        `${import.meta.env.VITE_API_BASE_URL || '/api/v1'}/auth/me`,
        { headers: { Authorization: `Bearer ${storedToken}` } }
      )
      .then(res => {
        // Token is valid — refresh user profile from server
        localStorage.setItem('user', JSON.stringify(res.data));
        setUser(res.data);
      })
      .catch(() => {
        // Token invalid or user no longer exists — clear everything
        clearStorage();
        setToken(null);
        setUser(null);
      })
      .finally(() => setIsValidating(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback((newToken: string, newUser: AuthUser) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    clearStorage();
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token, isValidating }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
