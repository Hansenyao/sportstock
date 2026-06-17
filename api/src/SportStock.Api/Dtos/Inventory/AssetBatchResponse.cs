namespace SportStock.Api.Dtos.Inventory;

// Response of adjust / retire / completeMaintenance.
// AvailableQuantity and Status are no longer stored on asset_batches;
// they are derived from asset_items at query time.
public sealed class AssetBatchResponse
{
    public Guid Id { get; set; }
    public Guid AssetTypeId { get; set; }
    public DateOnly? PurchaseDate { get; set; }
    public decimal? PurchasePrice { get; set; }
    public int? UsefulLifeYears { get; set; }
    public int TotalQuantity { get; set; }
    public int AvailableCount { get; set; }
    public int OnLoanCount { get; set; }
    public int MaintenanceCount { get; set; }
    public int RetiredCount { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
