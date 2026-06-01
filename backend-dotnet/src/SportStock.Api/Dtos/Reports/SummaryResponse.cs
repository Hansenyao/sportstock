namespace SportStock.Api.Dtos.Reports;

public sealed class CategoryBreakdownItem
{
    public string CategoryName { get; set; } = string.Empty;
    public long TotalQty { get; set; }
    public long AvailableQty { get; set; }
}

public sealed class SummaryResponse
{
    public long TotalAssets { get; set; }
    public long TotalItems { get; set; }
    public long AvailableItems { get; set; }
    public decimal TotalPurchaseValue { get; set; }
    public long ActiveTotal { get; set; }
    public long AvailableQty { get; set; }
    public long OnLoanQty { get; set; }
    public long MaintenanceQty { get; set; }
    public long RetiredQty { get; set; }
    public long ActiveLoans { get; set; }
    public long OverdueLoans { get; set; }
    public IReadOnlyList<CategoryBreakdownItem> CategoryBreakdown { get; set; } =
        Array.Empty<CategoryBreakdownItem>();
}
