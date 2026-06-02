namespace SportStock.Api.Dtos.Kit;
public record KitItemDto(Guid Id, Guid AssetTypeId, string AssetTypeName, int Quantity, int AvailableQuantity);
