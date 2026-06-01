namespace SportStock.Api.Dtos.Reports;

public sealed class TopAssetItem
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public long LoanCount { get; set; }
    public long TotalQuantityBorrowed { get; set; }
}

public sealed class CoachSummaryItem
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public long LoanCount { get; set; }
    public long ActiveLoans { get; set; }
}

public sealed class MonthlyTrendItem
{
    public string Month { get; set; } = string.Empty;
    public long LoanCount { get; set; }
}

public sealed class TeamSummary
{
    public Guid? Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? AgeGroup { get; set; }
    public string? Gender { get; set; }
    public long TotalLoans { get; set; }
    public long ActiveLoans { get; set; }
    public long OverdueLoans { get; set; }
}

public sealed class LoanUsageResponse
{
    public IReadOnlyList<TopAssetItem> TopAssets { get; set; } = Array.Empty<TopAssetItem>();
    public IReadOnlyList<CoachSummaryItem> CoachSummary { get; set; } = Array.Empty<CoachSummaryItem>();
    public IReadOnlyList<MonthlyTrendItem> MonthlyTrend { get; set; } = Array.Empty<MonthlyTrendItem>();
    public TeamSummary TeamSummary { get; set; } = new();
}
