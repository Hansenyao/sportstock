import client from './client';
import type { PaginatedResult } from './assets';
import type { UserRole } from '../types';

export interface ClubUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export const listUsers = (params?: Record<string, unknown>) =>
  client.get<PaginatedResult<ClubUser>>('/users', { params });

export const createUser = (data: { name: string; email: string; role: UserRole; phone?: string }) =>
  client.post<ClubUser>('/users', data);

export const updateUser = (id: string, data: { name?: string; phone?: string; role?: UserRole }) =>
  client.put<ClubUser>(`/users/${id}`, data);

export const deactivateUser = (id: string) =>
  client.delete(`/users/${id}`);
