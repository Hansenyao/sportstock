import client from './client';

export interface KitItem {
  id: string;
  asset_type_id: string;
  asset_type_name: string;
  quantity: number;
  available_quantity: number;
}

export interface Kit {
  id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  is_available: boolean;
  items: KitItem[];
}

export interface KitListItem {
  id: string;
  name: string;
  is_active: boolean;
  is_available: boolean;
  item_count: number;
}

export const listKits = () =>
  client.get<{ data: KitListItem[] }>('/kits');

export const getKit = (id: string) =>
  client.get<Kit>(`/kits/${id}`);

export const createKit = (data: { name: string; description?: string }) =>
  client.post<Kit>('/kits', data);

export const updateKit = (id: string, data: { name?: string; description?: string }) =>
  client.put<Kit>(`/kits/${id}`, data);

export const deleteKit = (id: string) =>
  client.delete(`/kits/${id}`);

export const addKitItem = (kitId: string, data: { asset_type_id: string; quantity: number }) =>
  client.post<KitItem>(`/kits/${kitId}/items`, data);

export const updateKitItem = (kitId: string, itemId: string, data: { quantity: number }) =>
  client.put<KitItem>(`/kits/${kitId}/items/${itemId}`, data);

export const removeKitItem = (kitId: string, itemId: string) =>
  client.delete(`/kits/${kitId}/items/${itemId}`);
