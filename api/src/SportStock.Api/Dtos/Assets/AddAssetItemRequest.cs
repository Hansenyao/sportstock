namespace SportStock.Api.Dtos.Assets;

public record AddAssetItemRequest(
    Guid WarehouseId,
    Guid? BatchId,
    string? SerialNumber,
    string? Notes
);
