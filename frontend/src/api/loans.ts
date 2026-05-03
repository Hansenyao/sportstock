import client from './client';
import type { PaginatedResult } from './assets';

export type LoanStatus = 'pending' | 'approved' | 'rejected' | 'checked_out' | 'returned';

export interface LoanItem {
  id: string;
  loan_id: string;
  asset_id: string;
  asset_name: string;
  asset_image?: string | null;
  brand?: string | null;
  model?: string | null;
  size?: string | null;
  asset_tag?: string | null;
  asset_available_quantity: number;
  quantity: number;
  returned_quantity?: number | null;       // computed: good + minor_damage
  good_quantity?: number | null;
  minor_damage_quantity?: number | null;
  write_off_quantity?: number | null;
  lost_quantity?: number | null;
  return_notes?: string | null;
}

export interface Loan {
  id: string;
  club_id: string;
  coach_id: string;
  coach_name: string;
  coach_email?: string;
  team_id?: string | null;
  team_name?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  approved_by?: string | null;
  approved_by_name?: string | null;
  checkout_by?: string | null;
  checkout_by_name?: string | null;
  return_confirmed_by?: string | null;
  return_confirmed_by_name?: string | null;
  reason?: string | null;
  status: LoanStatus;
  due_date: string;
  rejection_reason?: string | null;
  checked_out_at?: string | null;
  returned_at?: string | null;
  return_notes?: string | null;
  created_at: string;
  items: LoanItem[];
}

export interface LoanFilters {
  status?: LoanStatus;
  coach_id?: string;
  team_id?: string;
  from_date?: string;
  to_date?: string;
  page?: number;
  limit?: number;
}

export interface CartItem {
  asset_id: string;
  asset_name: string;
  asset_image?: string | null;
  brand?: string | null;
  model?: string | null;
  size?: string | null;
  asset_tag?: string | null;
  available_quantity: number;
  quantity: number;
}

export interface CreateLoanPayload {
  items: { asset_id: string; quantity: number }[];
  due_date: string;
  reason?: string;
  coach_id?: string;
  team_id?: string;
}

export interface UpdateLoanPayload {
  items?: { asset_id: string; quantity: number }[];
  due_date?: string;
  reason?: string;
  coach_id?: string;
}

export interface ReturnItemPayload {
  loan_item_id: string;
  good_quantity: number;
  minor_damage_quantity: number;
  write_off_quantity: number;
  lost_quantity: number;
  notes?: string;
}

export interface ConfirmReturnPayload {
  items: ReturnItemPayload[];
  notes?: string;
}

export const listLoans = (params?: LoanFilters) =>
  client.get<PaginatedResult<Loan>>('/loans', { params });

export const getLoan = (id: string) =>
  client.get<Loan>(`/loans/${id}`);

export const createLoan = (data: CreateLoanPayload) =>
  client.post<Loan>('/loans', data);

export const updateLoan = (id: string, data: UpdateLoanPayload) =>
  client.patch<Loan>(`/loans/${id}`, data);

export const deleteLoan = (id: string) =>
  client.delete(`/loans/${id}`);

export const approveLoan = (id: string) =>
  client.post<Loan>(`/loans/${id}/approve`);

export const rejectLoan = (id: string, reason?: string) =>
  client.post<Loan>(`/loans/${id}/reject`, { reason });

export const checkoutLoan = (id: string) =>
  client.post<Loan>(`/loans/${id}/checkout`);

export const confirmReturn = (id: string, data: ConfirmReturnPayload) =>
  client.post<Loan>(`/loans/${id}/return`, data);
