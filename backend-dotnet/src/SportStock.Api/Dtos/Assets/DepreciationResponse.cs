namespace SportStock.Api.Dtos.Assets;

// Result row of PG function `get_asset_depreciation(batch_id)`. Keeping a
// dedicated DTO (rather than returning the entity AssetDepreciationRow) so we
// can shape the JSON keys via JsonNamingPolicy.SnakeCaseLower exactly and add
// xml-doc here without touching the keyless entity.
public sealed class DepreciationResponse
{
    public Guid BatchId { get; set; }
    public Guid AssetTypeId { get; set; }
    public decimal PurchasePrice { get; set; }
    public decimal AnnualDepreciation { get; set; }
    public decimal YearsElapsed { get; set; }
    public decimal AccumulatedDepreciation { get; set; }
    public decimal NetBookValue { get; set; }
}
