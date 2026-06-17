namespace SportStock.Api.Dtos.Assets;

// Body for POST /api/v1/assets. The endpoint creates (or finds) an asset_type
// AND inserts the first asset_batch in a single transaction, so the body
// carries both type-level fields and batch-level fields. Node defaults
// total_quantity to 1 if omitted; we mirror that with a nullable int.
public sealed class CreateAssetRequest
{
    public Guid? AssetNameId { get; set; }
    public string? Brand { get; set; }
    public string? Model { get; set; }
    public string? Size { get; set; }
    public int? TotalQuantity { get; set; }
    public DateOnly? PurchaseDate { get; set; }
    public decimal? PurchasePrice { get; set; }
    public int? UsefulLifeYears { get; set; }
    public string? Notes { get; set; }
    public int? LowStockThreshold { get; set; }
    public Guid? WarehouseId { get; set; }
}
