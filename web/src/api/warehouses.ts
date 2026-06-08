import client from './client';

// Matches backend WarehouseDto(Guid Id, string Name, string? Description)
export interface Warehouse {
  id: string;
  name: string;
  description?: string | null;
  address?: string | null;
}

// Matches backend WarehouseListResult(List<WarehouseDto> Items, bool AutoSelect)
export interface WarehouseListResult {
  items: Warehouse[];
  auto_select: boolean;
}

export interface CreateWarehouseData {
  name: string;
  description?: string;
  address?: string;
}

// GET /warehouses → WarehouseListResult (plain object, not paginated)
export const listWarehouses = () =>
  client.get<WarehouseListResult>('/warehouses');

export const createWarehouse = (data: CreateWarehouseData) =>
  client.post<Warehouse>('/warehouses', data);

// PUT /warehouses/{id} → 204 No Content
export const updateWarehouse = (id: string, data: Partial<CreateWarehouseData>) =>
  client.put<void>(`/warehouses/${id}`, data);

export const deleteWarehouse = (id: string) =>
  client.delete(`/warehouses/${id}`);
