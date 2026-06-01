namespace SportStock.Api.Dtos.Reports;

public sealed class RetirementRiskItem
{
    public Guid BatchId { get; set; }
    public string AssetName { get; set; } = string.Empty;
    public string? Brand { get; set; }
    public string? Model { get; set; }
    public string? Size { get; set; }
    public DateOnly PurchaseDate { get; set; }
    public int UsefulLifeYears { get; set; }
    public int TotalQuantity { get; set; }
    public string BatchStatus { get; set; } = string.Empty;
    public int LifeUsedPercent { get; set; }
}

public sealed class LowStockItem
{
    public Guid AssetTypeId { get; set; }
    public string AssetName { get; set; } = string.Empty;
    public string? Brand { get; set; }
    public string? Model { get; set; }
    public string? Size { get; set; }
    public long TotalQty { get; set; }
    public long AvailableQty { get; set; }
    public int EffectiveThreshold { get; set; }
}

public sealed class AlertsResponse
{
    public IReadOnlyList<RetirementRiskItem> RetirementRisk { get; set; } = Array.Empty<RetirementRiskItem>();
    public IReadOnlyList<LowStockItem> LowStock { get; set; } = Array.Empty<LowStockItem>();
    public int TotalAlertCount { get; set; }
}
