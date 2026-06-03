// All values match the backend's snake_case JSON (SnakeCaseLower policy).

export type ClubRole = 'club_admin' | 'asset_manager' | 'coach' | 'accountant';

export interface ClubMembership {
  club_id: string;
  club_name: string;
  role: ClubRole;
}

// Stored in localStorage after login. clubs[] comes from LoginResult.
export interface AuthUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  is_sup_admin: boolean;
  clubs: ClubMembership[];
}

// Set after select-club (or auto-populated when login returns active_club_id).
export interface ActiveClub {
  club_id: string;
  club_name: string;
  role: ClubRole;
}

// Shape of POST /auth/login response (LoginResult in backend).
export interface LoginResult {
  token: string;
  is_sup_admin: boolean;
  active_club_id: string | null;
  active_role: ClubRole | null;
  clubs: ClubMembership[];
}

// Shape of GET /auth/me response (MeResult in backend).
export interface MeResult {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  is_sup_admin: boolean;
  is_active: boolean;
  email_verified: boolean;
  created_at: string;
  active_club_id?: string | null;
  role?: ClubRole | null;
  club_name?: string | null;
}

export interface PendingInvitation {
  invitation_id: string;
  club_id: string;
  club_name: string;
  invited_by_id: string;
  invited_by_name: string;
  role: ClubRole;
  created_at: string;
}

export interface ApiError {
  status_code: number;
  error: string;
  message: string;
}
