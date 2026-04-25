import client from './client';
import type { PaginatedResult } from './assets';

export type WriteOffSource = 'manual' | 'loan_return';

export interface WriteOff {
  id: string;
  club_id: string;
  asset_id: string;
  asset_name: string;
  asset_image?: string | null;
  brand?: string | null;
  model?: string | null;
  size?: string | null;
  asset_tag?: string | null;
  quantity: number;
  reason?: string | null;
  source: WriteOffSource;
  loan_item_id?: string | null;
  created_by: string;
  created_by_name: string;
  notes?: string | null;
  created_at: string;
}

export interface WriteOffFilters {
  asset_id?: string;
  source?: WriteOffSource;
  from_date?: string;
  to_date?: string;
  page?: number;
  limit?: number;
}

export interface CreateWriteOffPayload {
  asset_id: string;
  quantity: number;
  reason?: string;
  notes?: string;
}

export const listWriteOffs = (params?: WriteOffFilters) =>
  client.get<PaginatedResult<WriteOff>>('/write-offs', { params });

export const getWriteOff = (id: string) =>
  client.get<WriteOff>(`/write-offs/${id}`);

export const createWriteOff = (data: CreateWriteOffPayload) =>
  client.post<WriteOff>('/write-offs', data);
