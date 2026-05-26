using SportStock.Api.Data.Enums;

namespace SportStock.Api.Dtos.Inventory;

// Response of adjust / retire / completeMaintenance — mirrors Node's
// `SELECT * FROM asset_batches WHERE id = $1` shape.
public sealed class AssetBatchResponse
{
    public Guid Id { get; set; }
    public Guid AssetTypeId { get; set; }
    public DateOnly? PurchaseDate { get; set; }
    public decimal? PurchasePrice { get; set; }
    public int? UsefulLifeYears { get; set; }
    public int TotalQuantity { get; set; }
    public int AvailableQuantity { get; set; }
    public AssetStatus Status { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
