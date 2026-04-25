import client from './client';

export type AssetStatus = 'available' | 'on_loan' | 'maintenance' | 'retired';

export interface Asset {
  id: string;
  name: string;
  status: AssetStatus;
  total_quantity: number;
  available_quantity: number;
  category_name?: string | null;
  purchase_price?: number | null;
  purchase_date?: string | null;
  description?: string | null;
  image_url?: string | null;
  created_at: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export const listAssets = (params?: Record<string, unknown>) =>
  client.get<PaginatedResult<Asset>>('/assets', { params });
