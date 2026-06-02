namespace SportStock.Api.Dtos.Assets;

public record UpdateAssetItemRequest(
    Guid? WarehouseId,
    string? SerialNumber,
    string? Notes
);
