import client from './client';
import type { PaginatedResult } from './assets';
import type { ClubRole } from '../types';
import type { UserTeamMembership } from './teams';

export interface ClubUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: ClubRole;
  is_active: boolean;
  created_at: string;
  teams?: UserTeamMembership[];
}

export const listUsers = (params?: Record<string, unknown>) =>
  client.get<PaginatedResult<ClubUser>>('/users', { params });

export const getUser = (id: string) =>
  client.get<ClubUser>(`/users/${id}`);

export const createUser = (data: { name: string; email: string; role: ClubRole; phone?: string }) =>
  client.post<ClubUser>('/users', data);

export const updateUser = (id: string, data: { name?: string; phone?: string; role?: ClubRole }) =>
  client.put<ClubUser>(`/users/${id}`, data);

export const deactivateUser = (id: string) =>
  client.delete(`/users/${id}`);

// GET /clubs/{clubId}/members/search → plain List<UserSearchResult>
// Matches backend UserSearchResult(Guid Id, string FirstName, string LastName, string Email)
export const searchUsers = (clubId: string, query: string) =>
  client.get<Array<{ id: string; first_name: string; last_name: string; email: string }>>(
    `/clubs/${clubId}/members/search`,
    { params: { q: query } }
  );

export const updateMemberRole = (clubId: string, userId: string, role: ClubRole) =>
  client.put(`/clubs/${clubId}/members/${userId}/role`, { role });

export const removeMember = (clubId: string, userId: string) =>
  client.delete(`/clubs/${clubId}/members/${userId}`);
