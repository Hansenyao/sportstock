import client from './client';

export interface AssetName {
  id: string;
  club_id: string;
  name: string;
  category_id?: string | null;
  category_name?: string | null;
  type_count?: number;
  created_at: string;
}

export const listAssetNames = () =>
  client.get<AssetName[]>('/asset-names');

export const createAssetName = (name: string, categoryId?: string | null) =>
  client.post<AssetName>('/asset-names', { name, category_id: categoryId ?? null });

export const updateAssetName = (id: string, name: string, categoryId?: string | null) =>
  client.put<AssetName>(`/asset-names/${id}`, { name, category_id: categoryId ?? null });

export const deleteAssetName = (id: string) =>
  client.delete(`/asset-names/${id}`);
