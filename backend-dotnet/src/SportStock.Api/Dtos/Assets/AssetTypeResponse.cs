namespace SportStock.Api.Dtos.Assets;

// Mirrors the asset.service.ts TYPE_SELECT output 1:1. Field order matches the
// SELECT projection so the wire JSON keys appear in the same order as Node's.
public sealed class AssetTypeResponse
{
    public Guid Id { get; set; }
    public Guid ClubId { get; set; }
    public Guid AssetNameId { get; set; }
    public string Name { get; set; } = string.Empty;
    public Guid? CategoryId { get; set; }
    public string? CategoryName { get; set; }
    public string? Brand { get; set; }
    public string? Model { get; set; }
    public string? Size { get; set; }
    public string? ImageUrl { get; set; }
    public int? LowStockThreshold { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    // Aggregated across all batches.
    public int TotalQuantity { get; set; }
    public int AvailableQuantity { get; set; }
    public int BatchCount { get; set; }
    public string Status { get; set; } = string.Empty;

    public IReadOnlyList<BatchInfo> Batches { get; set; } = Array.Empty<BatchInfo>();
}
