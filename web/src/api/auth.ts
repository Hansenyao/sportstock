import client from './client';
import type { AuthUser } from '../types';

export interface RegisterData {
  club: {
    name: string;
    sport_type?: string;
    address?: string;
    contact_email: string;
  };
  user: {
    name: string;
    email: string;
    password: string;
    phone?: string;
  };
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export const register = (data: RegisterData) =>
  client.post<{ message: string }>('/auth/register', data);

export const verifyEmail = (email: string, code: string) =>
  client.post<{ message: string }>('/auth/verify-email', { email, code });

export const resendVerification = (email: string) =>
  client.post<{ message: string }>('/auth/resend-verification', { email });

export const login = (email: string, password: string) =>
  client.post<LoginResponse>('/auth/login', { email, password });

export const forgotPassword = (email: string) =>
  client.post<{ message: string }>('/auth/forgot-password', { email });

export const resetPassword = (email: string, code: string, new_password: string) =>
  client.post<{ message: string }>('/auth/reset-password', { email, code, new_password });

export const changePassword = (current_password: string, new_password: string) =>
  client.put<{ message: string }>('/auth/password', { current_password, new_password });

export const getMe = () =>
  client.get<AuthUser>('/auth/me');
