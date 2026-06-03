import client from './client';
import type { PaginatedResult } from './assets';
import type { UserRole } from '../types';
import type { UserTeamMembership } from './teams';

export interface ClubUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  teams?: UserTeamMembership[];
}

export const listUsers = (params?: Record<string, unknown>) =>
  client.get<PaginatedResult<ClubUser>>('/users', { params });

export const getUser = (id: string) =>
  client.get<ClubUser>(`/users/${id}`);

export const createUser = (data: { name: string; email: string; role: UserRole; phone?: string }) =>
  client.post<ClubUser>('/users', data);

export const updateUser = (id: string, data: { name?: string; phone?: string; role?: UserRole }) =>
  client.put<ClubUser>(`/users/${id}`, data);

export const deactivateUser = (id: string) =>
  client.delete(`/users/${id}`);

export const searchUsers = (clubId: string, query: string) =>
  client.get<{ data: Array<{ id: string; first_name: string; last_name: string; email: string }> }>(
    `/clubs/${clubId}/members/search`,
    { params: { q: query } }
  );
