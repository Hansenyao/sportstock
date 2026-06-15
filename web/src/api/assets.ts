import client from './client';

export type AssetStatus = 'available' | 'on_loan' | 'maintenance' | 'retired';

export interface Category {
  id: string;
  name: string;
  is_system: boolean;
}

export interface AssetBatch {
  id: string;
  purchase_date?: string | null;
  purchase_price?: number | null;
  useful_life_years?: number | null;
  total_quantity: number;
  available_quantity: number;
  status: AssetStatus;
  notes?: string | null;
  created_at: string;
}

export interface AssetType {
  id: string;
  club_id: string;
  asset_name_id: string;
  name: string;
  category_id?: string | null;
  category_name?: string | null;
  brand?: string | null;
  model?: string | null;
  size?: string | null;
  image_url?: string | null;
  low_stock_threshold?: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  total_quantity: number;
  available_quantity: number;
  batch_count: number;
  status: AssetStatus;
  batches: AssetBatch[];
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
  client.get<PaginatedResult<AssetType>>('/assets', { params });

export const getAsset = (id: string) =>
  client.get<AssetType>(`/assets/${id}`);

export const createAsset = (data: Record<string, unknown>) =>
  client.post<AssetType>('/assets', data);

export const updateAsset = (id: string, data: Record<string, unknown>) =>
  client.put<AssetType>(`/assets/${id}`, data);

export const deleteAsset = (id: string) =>
  client.delete(`/assets/${id}`);

export const uploadAssetImage = (id: string, file: File) => {
  const form = new FormData();
  form.append('image', file);
  return client.put<{ id: string; image_url: string }>(`/assets/${id}/image`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const addBatch = (typeId: string, data: Record<string, unknown>) =>
  client.post<AssetType>(`/assets/${typeId}/batches`, data);

export const updateBatch = (typeId: string, batchId: string, data: Record<string, unknown>) =>
  client.put<AssetType>(`/assets/${typeId}/batches/${batchId}`, data);

export const getBatchDepreciation = (typeId: string, batchId: string) =>
  client.get<Record<string, unknown>>(`/assets/${typeId}/batches/${batchId}/depreciation`);

// Matches backend AssetItemDto(Guid Id, Guid AssetTypeId, Guid? BatchId, Guid WarehouseId,
//   string WarehouseName, string? SerialNumber, string Status, string? Notes, DateTime CreatedAt)
export interface AssetItem {
  id: string;
  asset_type_id: string;
  batch_id?: string | null;
  warehouse_id: string;
  warehouse_name: string;
  serial_number?: string | null;
  status: 'available' | 'on_loan' | 'maintenance' | 'retired' | 'written_off';
  notes?: string | null;
  created_at: string;
}

// GET /assets/{typeId}/items → plain List<AssetItemDto> (not paginated)
export const getAssetItems = (typeId: string) =>
  client.get<AssetItem[]>(`/assets/${typeId}/items`);

export const updateAssetItem = (itemId: string, data: { warehouse_id?: string; serial_number?: string; notes?: string }) =>
  client.put<AssetItem>(`/assets/items/${itemId}`, data);

// POST /assets/items/{itemId}/retire → 204 No Content
export const retireItem = (itemId: string) =>
  client.post<void>(`/assets/items/${itemId}/retire`);

// POST /assets/items/{itemId}/write-off → 204 No Content (body: { reason })
export const writeOffItem = (itemId: string, reason: string) =>
  client.post<void>(`/assets/items/${itemId}/write-off`, { reason });

// POST /assets/{typeId}/items/retire → 204 No Content (body: { quantity, notes? })
export const retireByQuantity = (typeId: string, quantity: number, notes?: string) =>
  client.post<void>(`/assets/${typeId}/items/retire`, { quantity, notes });

// POST /assets/{typeId}/items/write-off → 204 No Content (body: { quantity, reason })
export const writeOffByQuantity = (typeId: string, quantity: number, reason: string) =>
  client.post<void>(`/assets/${typeId}/items/write-off`, { quantity, reason });

// DELETE /assets/items/{itemId} → 204 No Content (only for available items, correction use)
export const deleteItem = (itemId: string) =>
  client.delete<void>(`/assets/items/${itemId}`);
