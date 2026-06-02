namespace SportStock.Api.Dtos.Assets;

public record AssetItemDto(
    Guid Id,
    Guid AssetTypeId,
    Guid? BatchId,
    Guid WarehouseId,
    string WarehouseName,
    string? SerialNumber,
    string Status,
    string? Notes,
    DateTime CreatedAt
);
