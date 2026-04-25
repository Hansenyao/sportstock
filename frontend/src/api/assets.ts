import client from './client';

export type AssetStatus = 'available' | 'on_loan' | 'maintenance' | 'retired';

export interface Category {
  id: string;
  name: string;
  is_system: boolean;
}

export interface Asset {
  id: string;
  name: string;
  status: AssetStatus;
  total_quantity: number;
  available_quantity: number;
  category_id?: string | null;
  category_name?: string | null;
  brand?: string | null;
  model?: string | null;
  size?: string | null;
  asset_tag?: string | null;
  purchase_date?: string | null;
  purchase_price?: number | null;
  useful_life_years?: number | null;
  notes?: string | null;
  low_stock_threshold?: number | null;
  image_url?: string | null;
  created_at: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface AssetFilters {
  search?: string;
  status?: string;
  category_id?: string;
  page?: number;
  limit?: number;
}

export const listCategories = () =>
  client.get<Category[]>('/assets/categories');

export const createCategory = (name: string) =>
  client.post<Category>('/assets/categories', { name });

export const listAssets = (params?: AssetFilters) =>
  client.get<PaginatedResult<Asset>>('/assets', { params });

export const createAsset = (data: Record<string, unknown>) =>
  client.post<Asset>('/assets', data);

export const updateAsset = (id: string, data: Record<string, unknown>) =>
  client.put<Asset>(`/assets/${id}`, data);

export const deleteAsset = (id: string) =>
  client.delete(`/assets/${id}`);

export const uploadAssetImage = (id: string, file: File) => {
  const form = new FormData();
  form.append('image', file);
  return client.put<{ id: string; image_url: string }>(`/assets/${id}/image`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
