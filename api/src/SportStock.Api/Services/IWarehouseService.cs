using SportStock.Api.Dtos.Warehouse;

namespace SportStock.Api.Services;

public interface IWarehouseService
{
    Task<WarehouseListResult> ListAsync(Guid clubId);
    Task<WarehouseDto> CreateAsync(Guid clubId, CreateWarehouseRequest req);
    Task UpdateAsync(Guid clubId, Guid warehouseId, UpdateWarehouseRequest req);
    Task DeleteAsync(Guid clubId, Guid warehouseId);
}
