namespace SportStock.Api.Dtos.Assets;

// POST /api/v1/assets/:id/batches — add a new batch to an existing asset_type.
// Defaults match Node: total_quantity = 1 when omitted, all other fields
// nullable.
public sealed class CreateBatchRequest
{
    public int? TotalQuantity { get; set; }
    public DateOnly? PurchaseDate { get; set; }
    public decimal? PurchasePrice { get; set; }
    public int? UsefulLifeYears { get; set; }
    public string? Notes { get; set; }
}
