import client from './client';
import type { PaginatedResult } from './assets';

export type LoanStatus = 'pending' | 'approved' | 'rejected' | 'checked_out' | 'returned';

export interface Loan {
  id: string;
  asset_id: string;
  asset_name: string;
  borrower_id: string;
  borrower_name: string;
  status: LoanStatus;
  quantity: number;
  purpose?: string | null;
  expected_return_date?: string | null;
  created_at: string;
}

export const listLoans = (params?: Record<string, unknown>) =>
  client.get<PaginatedResult<Loan>>('/loans', { params });
