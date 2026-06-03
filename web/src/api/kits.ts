import client from './client';

// Matches backend KitItemDto(Guid Id, Guid AssetTypeId, string AssetTypeName, int Quantity, int AvailableQuantity)
export interface KitItem {
  id: string;
  asset_type_id: string;
  asset_type_name: string;
  quantity: number;
  available_quantity: number;
}

// Matches backend KitDetailDto(Guid Id, string Name, string? Description, bool IsAvailable, List<KitItemDto> Items)
export interface Kit {
  id: string;
  name: string;
  description?: string | null;
  is_available: boolean;
  items: KitItem[];
}

// Matches backend KitDto(Guid Id, string Name, string? Description, bool IsActive)
export interface KitListItem {
  id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
}

// GET /kits → List<KitDto> (plain array)
export const listKits = () =>
  client.get<KitListItem[]>('/kits');

export const getKit = (id: string) =>
  client.get<Kit>(`/kits/${id}`);

// POST /kits → 201 KitDetailDto
export const createKit = (data: { name: string; description?: string }) =>
  client.post<Kit>('/kits', data);

// PUT /kits/{id} → 204 No Content
export const updateKit = (id: string, data: { name?: string; description?: string }) =>
  client.put<void>(`/kits/${id}`, data);

export const deleteKit = (id: string) =>
  client.delete(`/kits/${id}`);

// POST /kits/{id}/items → 201 KitItemDto
export const addKitItem = (kitId: string, data: { asset_type_id: string; quantity: number }) =>
  client.post<KitItem>(`/kits/${kitId}/items`, data);

// PUT /kits/{id}/items/{itemId} → 200 KitItemDto
export const updateKitItem = (kitId: string, itemId: string, data: { quantity: number }) =>
  client.put<KitItem>(`/kits/${kitId}/items/${itemId}`, data);

export const removeKitItem = (kitId: string, itemId: string) =>
  client.delete(`/kits/${kitId}/items/${itemId}`);
