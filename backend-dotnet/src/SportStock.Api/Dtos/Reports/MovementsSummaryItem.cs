namespace SportStock.Api.Dtos.Reports;

public sealed class MovementsSummaryItem
{
    public string Type { get; set; } = string.Empty;
    public long Count { get; set; }
    public long TotalUnits { get; set; }
}
