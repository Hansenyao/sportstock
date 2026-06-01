namespace SportStock.Api.Dtos.Inventory;

// One element inside UpdateStocktakeRequest.Items. Node skips entries where
// asset_type_id or physical_quantity is missing; we model both as nullable.
public sealed class StocktakeItemInput
{
    public Guid? AssetTypeId { get; set; }
    public int? PhysicalQuantity { get; set; }
    public string? Notes { get; set; }
}
