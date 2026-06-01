using Microsoft.AspNetCore.Mvc;

namespace SportStock.Api.Dtos.Reports;

// ASP.NET Core does NOT translate query-string snake_case to PascalCase
// automatically; without [FromQuery(Name=...)] the binder silently leaves
// the property null. Earlier phases got lucky because their tests didn't
// distinguish a working filter from a no-op one.
public sealed class LoanUsageQuery
{
    [FromQuery(Name = "team_id")] public Guid? TeamId { get; set; }
    [FromQuery(Name = "from_date")] public DateTime? FromDate { get; set; }
    [FromQuery(Name = "to_date")] public DateTime? ToDate { get; set; }
}

public sealed class MovementsRangeQuery
{
    [FromQuery(Name = "from_date")] public DateTime? FromDate { get; set; }
    [FromQuery(Name = "to_date")] public DateTime? ToDate { get; set; }
}
