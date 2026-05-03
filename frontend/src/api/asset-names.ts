import client from './client';

export interface AssetName {
  id: string;
  club_id: string;
  name: string;
  type_count?: number;
  created_at: string;
}

export const listAssetNames = () =>
  client.get<AssetName[]>('/asset-names');

export const createAssetName = (name: string) =>
  client.post<AssetName>('/asset-names', { name });

export const updateAssetName = (id: string, name: string) =>
  client.put<AssetName>(`/asset-names/${id}`, { name });

export const deleteAssetName = (id: string) =>
  client.delete(`/asset-names/${id}`);
