import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { AuthUser, ActiveClub, LoginResult, ClubMembership } from '../types';
import * as authApi from '../api/auth';
import * as invitationsApi from '../api/memberships';
import { setToken } from '../api/client';

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  activeClub: ActiveClub | null;
  pendingInvitationCount: number;
  isValidating: boolean;
  isAuthenticated: boolean;
  login: (result: LoginResult) => Promise<void>;
  selectClub: (clubId: string) => Promise<void>;
  logout: () => void;
  refreshInvitationCount: () => Promise<void>;
  updateUserClubs: (clubs: ClubMembership[]) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function clearStorage() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('active_club_id');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem('token'));
  const [user, setUser] = useState<AuthUser | null>(() => {
    const s = localStorage.getItem('user');
    try { return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [activeClub, setActiveClub] = useState<ActiveClub | null>(null);
  const [pendingInvitationCount, setPendingInvitationCount] = useState(0);
  const [isValidating, setIsValidating] = useState(!!localStorage.getItem('token'));

  // Keep module-level token store in sync
  const applyToken = useCallback((t: string | null) => {
    setToken(t);
    setTokenState(t);
    if (t) localStorage.setItem('token', t);
    else localStorage.removeItem('token');
  }, []);

  const refreshInvitationCount = useCallback(async () => {
    try {
      const res = await invitationsApi.getMyInvitations();
      setPendingInvitationCount(res.data.total ?? 0);
    } catch {
      setPendingInvitationCount(0);
    }
  }, []);

  const selectClub = useCallback(async (clubId: string) => {
    const res = await authApi.selectClub(clubId);
    const newToken = res.data.token;
    applyToken(newToken);
    localStorage.setItem('active_club_id', clubId);
    // Derive club info from stored user.clubs
    const stored = localStorage.getItem('user');
    const storedUser: AuthUser | null = stored ? JSON.parse(stored) : null;
    const found = storedUser?.clubs.find(c => c.club_id === clubId) ?? null;
    if (found) setActiveClub({ club_id: found.club_id, club_name: found.club_name, role: found.role });
  }, [applyToken]);

  const login = useCallback(async (result: LoginResult) => {
    applyToken(result.token);

    // Fetch full profile (id, first_name, last_name, email, phone, is_sup_admin)
    const meRes = await authApi.getMe();
    const me = meRes.data;

    const authUser: AuthUser = {
      id: me.id,
      first_name: me.first_name,
      last_name: me.last_name,
      email: me.email,
      phone: me.phone,
      is_sup_admin: me.is_sup_admin,
      avatar_url: me.avatar_url,
      clubs: result.clubs,
    };
    localStorage.setItem('user', JSON.stringify(authUser));
    setUser(authUser);

    if (result.active_club_id && result.active_role) {
      // Backend already issued scoped token (single-club case)
      const clubName = result.clubs.find(c => c.club_id === result.active_club_id)?.club_name ?? '';
      const club: ActiveClub = { club_id: result.active_club_id, club_name: clubName, role: result.active_role };
      setActiveClub(club);
      localStorage.setItem('active_club_id', result.active_club_id);
    } else if (result.clubs.length > 0) {
      // Multiple clubs — auto-select first
      await selectClub(result.clubs[0].club_id);
    }
    // else: 0 clubs — activeClub stays null

    await refreshInvitationCount();
  }, [applyToken, selectClub, refreshInvitationCount]);

  const logout = useCallback(() => {
    clearStorage();
    applyToken(null);
    setUser(null);
    setActiveClub(null);
    setPendingInvitationCount(0);
  }, [applyToken]);

  const updateUserClubs = useCallback((clubs: ClubMembership[]) => {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, clubs };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const refreshUser = useCallback(async () => {
    const meRes = await authApi.getMe();
    const me = meRes.data;
    setUser(prev => {
      if (!prev) return prev;
      const updated: AuthUser = { ...prev, first_name: me.first_name, last_name: me.last_name, email: me.email, phone: me.phone, avatar_url: me.avatar_url };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Startup: validate stored token
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) { setIsValidating(false); return; }
    setToken(storedToken);

    authApi.getMe()
      .then(async res => {
        const me = res.data;
        const storedUserRaw = localStorage.getItem('user');
        const storedUser: AuthUser | null = storedUserRaw ? JSON.parse(storedUserRaw) : null;

        const authUser: AuthUser = {
          id: me.id,
          first_name: me.first_name,
          last_name: me.last_name,
          email: me.email,
          phone: me.phone,
          is_sup_admin: me.is_sup_admin,
          avatar_url: me.avatar_url,
          clubs: storedUser?.clubs ?? [],
        };
        localStorage.setItem('user', JSON.stringify(authUser));
        setUser(authUser);

        const storedClubId = localStorage.getItem('active_club_id');
        if (storedClubId && authUser.clubs.some(c => c.club_id === storedClubId)) {
          await selectClub(storedClubId);
        }
        await refreshInvitationCount();
      })
      .catch(() => {
        clearStorage();
        applyToken(null);
        setUser(null);
        setActiveClub(null);
      })
      .finally(() => setIsValidating(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthContext.Provider value={{
      token, user, activeClub, pendingInvitationCount,
      isValidating, isAuthenticated: !!token,
      login, selectClub, logout, refreshInvitationCount, updateUserClubs, refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
