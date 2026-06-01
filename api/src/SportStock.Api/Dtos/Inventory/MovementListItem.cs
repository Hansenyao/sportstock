using SportStock.Api.Data.Enums;

namespace SportStock.Api.Dtos.Inventory;

// Mirrors the Node movements SELECT projection — sm.* + denormalized
// asset_name / brand / model / size / operator_name. Status field comes
// from the global JsonStringEnumConverter (snake_case wire string).
public sealed class MovementListItem
{
    public Guid Id { get; set; }
    public Guid ClubId { get; set; }
    public Guid? AssetBatchId { get; set; }
    public Guid? LoanId { get; set; }
    public Guid? LoanItemId { get; set; }
    public Guid? OperatorId { get; set; }
    public StockMovementType Type { get; set; }
    public int QuantityDelta { get; set; }
    public int QuantityBefore { get; set; }
    public int QuantityAfter { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }

    public string? AssetName { get; set; }
    public string? Brand { get; set; }
    public string? Model { get; set; }
    public string? Size { get; set; }
    public string? OperatorName { get; set; }
}
