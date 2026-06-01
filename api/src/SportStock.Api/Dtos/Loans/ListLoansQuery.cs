using Microsoft.AspNetCore.Mvc;

namespace SportStock.Api.Dtos.Loans;

public sealed class ListLoansQuery
{
    [FromQuery(Name = "status")] public string? Status { get; set; }
    // Truthy = overdue-only. Node accepts any truthy string ("true", "1");
    // we model as nullable string and treat any non-empty value as enabled
    // to preserve that behavior.
    [FromQuery(Name = "overdue")] public string? Overdue { get; set; }
    [FromQuery(Name = "search")] public string? Search { get; set; }
    [FromQuery(Name = "coach_id")] public Guid? CoachId { get; set; }
    [FromQuery(Name = "team_id")] public Guid? TeamId { get; set; }
    [FromQuery(Name = "from_date")] public DateTime? FromDate { get; set; }
    [FromQuery(Name = "to_date")] public DateTime? ToDate { get; set; }
    [FromQuery(Name = "page")] public int Page { get; set; } = 1;
    [FromQuery(Name = "limit")] public int Limit { get; set; } = 20;
}
