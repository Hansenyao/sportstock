namespace SportStock.Api.Dtos.Inventory;

// One row in StocktakeSessionDetailResponse.items[]. Matches Node:
// si.* + an.name + at.brand/model/size + current_quantity (SUM live).
public sealed class StocktakeItemInfo
{
    public Guid Id { get; set; }
    public Guid SessionId { get; set; }
    public Guid AssetTypeId { get; set; }
    public int SystemQuantity { get; set; }
    public int PhysicalQuantity { get; set; }
    public int? Variance { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }

    public string AssetName { get; set; } = string.Empty;
    public string? Brand { get; set; }
    public string? Model { get; set; }
    public string? Size { get; set; }
    public int CurrentQuantity { get; set; }
}
