namespace SportStock.Api.Dtos.Reports;

public sealed class DepreciationItem
{
    public Guid BatchId { get; set; }
    public string AssetName { get; set; } = string.Empty;
    public string? Brand { get; set; }
    public string? Model { get; set; }
    public string? Size { get; set; }
    public string BatchStatus { get; set; } = string.Empty;
    public DateOnly? PurchaseDate { get; set; }
    public int TotalQuantity { get; set; }
    public string? CategoryName { get; set; }
    public decimal? PurchasePrice { get; set; }
    public decimal? AnnualDepreciation { get; set; }
    public decimal? YearsElapsed { get; set; }
    public decimal? AccumulatedDepreciation { get; set; }
    public decimal? NetBookValue { get; set; }
}

public sealed class DepreciationSummary
{
    public int TotalBatchesWithDepreciation { get; set; }
    public string TotalPurchaseValue { get; set; } = "0.00";
    public string TotalNetBookValue { get; set; } = "0.00";
    public string TotalAccumulatedDepreciation { get; set; } = "0.00";
}

public sealed class DepreciationReportResponse
{
    public IReadOnlyList<DepreciationItem> Items { get; set; } = Array.Empty<DepreciationItem>();
    public DepreciationSummary Summary { get; set; } = new();
}
