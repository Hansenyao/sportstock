namespace SportStock.Api.Dtos.Reports;

public sealed class RecentMovementItem
{
    public Guid Id { get; set; }
    public string AssetTypeName { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public int QuantityDelta { get; set; }
    public DateTime CreatedAt { get; set; }
}
