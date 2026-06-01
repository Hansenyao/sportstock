using SportStock.Api.Data.Enums;

namespace SportStock.Api.Dtos.Assets;

// One element of the `batches` array in an AssetTypeResponse. Field order
// matches Node's JSON_BUILD_OBJECT key list in asset.service.ts TYPE_SELECT.
// Status is the AssetStatus enum — global JsonStringEnumConverter emits it as
// the snake_case wire string ("available", "on_loan", ...).
public sealed class BatchInfo
{
    public Guid Id { get; set; }
    public DateOnly? PurchaseDate { get; set; }
    public decimal? PurchasePrice { get; set; }
    public int? UsefulLifeYears { get; set; }
    public int TotalQuantity { get; set; }
    public int AvailableQuantity { get; set; }
    public AssetStatus Status { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
}
