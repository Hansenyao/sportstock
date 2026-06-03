import client from './client';
import type { LoginResult, MeResult } from '../types';

export interface RegisterClubData {
  user: {
    first_name: string;
    last_name: string;
    email: string;
    password: string;
    phone?: string;
  };
  club: {
    name: string;
    sport_type_id: string;
    address?: string;
    contact_email: string;
  };
}

export interface RegisterUserData {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  phone?: string;
}

export const registerClub = (data: RegisterClubData) =>
  client.post<{ message: string }>('/auth/register', data);

export const registerUser = (data: RegisterUserData) =>
  client.post<{ message: string }>('/auth/register', {
    first_name: data.first_name,
    last_name: data.last_name,
    email: data.email,
    password: data.password,
    phone: data.phone,
  });

export const verifyEmail = (email: string, code: string) =>
  client.post<{ message: string }>('/auth/verify-email', { email, code });

export const resendVerification = (email: string) =>
  client.post<{ message: string }>('/auth/resend-verification', { email });

export const login = (email: string, password: string) =>
  client.post<LoginResult>('/auth/login', { email, password });

export const selectClub = (club_id: string) =>
  client.post<{ token: string }>('/auth/select-club', { club_id });

export const createClub = (data: { name: string; sport_type_id: string; address?: string; contact_email: string }) =>
  client.post<{ club_id: string; club_name: string }>('/auth/register-club', data);

export const getMe = () =>
  client.get<MeResult>('/auth/me');

export const updateProfile = (data: { first_name?: string; last_name?: string; phone?: string | null }) =>
  client.put<{ message: string }>('/auth/profile', data);

export const forgotPassword = (email: string) =>
  client.post<{ message: string }>('/auth/forgot-password', { email });

export const resetPassword = (email: string, code: string, new_password: string) =>
  client.post<{ message: string }>('/auth/reset-password', { email, code, new_password });

export const changePassword = (current_password: string, new_password: string) =>
  client.put<{ message: string }>('/auth/password', { current_password, new_password });
