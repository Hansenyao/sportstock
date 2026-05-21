// frontend/src/admin/api/admin.ts
import axios from 'axios';

const TOKEN_KEY = 'admin_token';
const BASE = `${import.meta.env.VITE_API_BASE_URL || '/api/v1'}/admin`;

const adminApi = axios.create({ baseURL: BASE });

adminApi.interceptors.request.use(config => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

adminApi.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('admin_user');
      window.location.href = '/admin/login';
    }
    return Promise.reject(err);
  }
);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlatformStats {
  total_clubs: number;
  active_clubs: number;
  total_users: number;
  total_assets: number;
  active_loans: number;
  overdue_loans: number;
}

export interface ClubListItem {
  id: string;
  name: string;
  sport_type: string | null;
  contact_email: string;
  is_active: boolean;
  created_at: string;
  user_count: number;
  asset_count: number;
  active_loan_count: number;
}

export interface ClubAdminAccount {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  email_verified: boolean;
}

export interface ClubDetail {
  id: string;
  name: string;
  sport_type: string | null;
  contact_email: string;
  address: string | null;
  is_active: boolean;
  created_at: string;
  admin_account: ClubAdminAccount | null;
  stats: {
    user_count: number;
    asset_count: number;
    active_loan_count: number;
    overdue_loan_count: number;
  };
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// ── API functions ─────────────────────────────────────────────────────────────

export const getStats = () =>
  adminApi.get<PlatformStats>('/stats').then(r => r.data);

export const getAnalyticsOverview = (clubId?: string) =>
  adminApi.get<Record<string, unknown>>('/analytics/overview', { params: clubId ? { club_id: clubId } : undefined }).then(r => r.data);

export const getAnalyticsLoans = (clubId?: string) =>
  adminApi.get<Record<string, unknown>>('/analytics/loans', { params: clubId ? { club_id: clubId } : undefined }).then(r => r.data);

export const getAnalyticsAssets = (clubId?: string) =>
  adminApi.get<Record<string, unknown>>('/analytics/assets', { params: clubId ? { club_id: clubId } : undefined }).then(r => r.data);

export const getAnalyticsGrowth = () =>
  adminApi.get<Record<string, unknown>>('/analytics/growth').then(r => r.data);

export const listClubs = (params?: { page?: number; limit?: number; search?: string }) =>
  adminApi.get<Paginated<ClubListItem>>('/clubs', { params }).then(r => r.data);

export const getClubDetail = (id: string) =>
  adminApi.get<ClubDetail>(`/clubs/${id}`).then(r => r.data);

export const updateClubStatus = (id: string, is_active: boolean) =>
  adminApi.patch(`/clubs/${id}/status`, { is_active });

export const resetClubAdminPassword = (id: string) =>
  adminApi.post<{ temp_password: string }>(`/clubs/${id}/reset-admin-password`).then(r => r.data);

export const listClubUsers = (clubId: string, params?: { page?: number; limit?: number }) =>
  adminApi.get<Paginated<Record<string, unknown>>>(`/clubs/${clubId}/users`, { params }).then(r => r.data);

export const updateUserStatus = (clubId: string, userId: string, is_active: boolean) =>
  adminApi.patch(`/clubs/${clubId}/users/${userId}/status`, { is_active });

export const resetUserPassword = (clubId: string, userId: string) =>
  adminApi.post<{ temp_password: string }>(`/clubs/${clubId}/users/${userId}/reset-password`).then(r => r.data);

export const listClubAssets = (clubId: string, params?: { page?: number; limit?: number }) =>
  adminApi.get<Paginated<Record<string, unknown>>>(`/clubs/${clubId}/assets`, { params }).then(r => r.data);

export const retireAsset = (clubId: string, assetTypeId: string) =>
  adminApi.patch(`/clubs/${clubId}/assets/${assetTypeId}/status`, { status: 'retired' });

export const deleteAsset = (clubId: string, assetTypeId: string) =>
  adminApi.delete(`/clubs/${clubId}/assets/${assetTypeId}`);

export const listClubLoans = (
  clubId: string,
  params?: { page?: number; limit?: number; status?: string }
) => adminApi.get<Paginated<Record<string, unknown>>>(`/clubs/${clubId}/loans`, { params }).then(r => r.data);

export default adminApi;
