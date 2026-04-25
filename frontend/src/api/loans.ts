import client from './client';
import type { PaginatedResult } from './assets';

export type LoanStatus = 'pending' | 'approved' | 'rejected' | 'checked_out' | 'returned';
export type ReturnCondition = 'good' | 'minor_damage' | 'severe_damage';

export interface Loan {
  id: string;
  club_id: string;
  asset_id: string;
  asset_name: string;
  asset_image?: string | null;
  coach_id: string;
  coach_name: string;
  coach_email?: string;
  approved_by?: string | null;
  approved_by_name?: string | null;
  checkout_by?: string | null;
  checkout_by_name?: string | null;
  return_confirmed_by?: string | null;
  return_confirmed_by_name?: string | null;
  quantity: number;
  reason?: string | null;
  status: LoanStatus;
  due_date: string;
  checked_out_at?: string | null;
  returned_at?: string | null;
  return_condition?: ReturnCondition | null;
  return_notes?: string | null;
  created_at: string;
}

export interface LoanFilters {
  status?: LoanStatus;
  coach_id?: string;
  asset_id?: string;
  from_date?: string;
  to_date?: string;
  page?: number;
  limit?: number;
}

export interface CreateLoanPayload {
  asset_id: string;
  quantity: number;
  due_date: string;
  reason?: string;
  coach_id?: string;
}

export interface ConfirmReturnPayload {
  condition: ReturnCondition;
  returned_quantity: number;
  notes?: string;
}

export const listLoans = (params?: LoanFilters) =>
  client.get<PaginatedResult<Loan>>('/loans', { params });

export const getLoan = (id: string) =>
  client.get<Loan>(`/loans/${id}`);

export const createLoan = (data: CreateLoanPayload) =>
  client.post<Loan>('/loans', data);

export const approveLoan = (id: string) =>
  client.post<Loan>(`/loans/${id}/approve`);

export const rejectLoan = (id: string, reason?: string) =>
  client.post<Loan>(`/loans/${id}/reject`, { reason });

export const checkoutLoan = (id: string) =>
  client.post<Loan>(`/loans/${id}/checkout`);

export const initiateReturn = (id: string) =>
  client.post<{ message: string }>(`/loans/${id}/initiate-return`);

export const confirmReturn = (id: string, data: ConfirmReturnPayload) =>
  client.post<Loan>(`/loans/${id}/return`, data);
