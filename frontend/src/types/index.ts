export type UserRole = 'super_admin' | 'club_admin' | 'asset_manager' | 'coach';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  club_id: string | null;
  club_name?: string | null;
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
}
