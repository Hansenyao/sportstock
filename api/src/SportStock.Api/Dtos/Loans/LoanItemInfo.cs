namespace SportStock.Api.Dtos.Loans;

// One element of a Loan's items[] array. Mirrors the Node ITEM_SELECT
// projection: li.* + returned_quantity (computed) + denormalized name /
// image / brand / model / size from asset_types + asset_names.
public sealed class LoanItemInfo
{
    public Guid Id { get; set; }
    public Guid LoanId { get; set; }
    public Guid AssetTypeId { get; set; }
    public int Quantity { get; set; }
    public int? GoodQuantity { get; set; }
    public int? MinorDamageQuantity { get; set; }
    public int? WriteOffQuantity { get; set; }
    public int? LostQuantity { get; set; }
    public string? ReturnNotes { get; set; }
    public Guid? KitId { get; set; }
    public string? KitName { get; set; }
    public int? KitQuantity { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public int ReturnedQuantity { get; set; }
    public string AssetName { get; set; } = string.Empty;
    public string? AssetImage { get; set; }
    public string? Brand { get; set; }
    public string? Model { get; set; }
    public string? Size { get; set; }
}
