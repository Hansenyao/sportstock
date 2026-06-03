import client from './client';

export interface Warehouse {
  id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface CreateWarehouseData {
  name: string;
  description?: string;
}

export const listWarehouses = () =>
  client.get<{ data: Warehouse[]; total: number }>('/warehouses');

export const createWarehouse = (data: CreateWarehouseData) =>
  client.post<Warehouse>('/warehouses', data);

export const updateWarehouse = (id: string, data: Partial<CreateWarehouseData> & { is_active?: boolean }) =>
  client.put<Warehouse>(`/warehouses/${id}`, data);

export const deleteWarehouse = (id: string) =>
  client.delete(`/warehouses/${id}`);
