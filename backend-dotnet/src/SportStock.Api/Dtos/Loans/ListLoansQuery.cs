namespace SportStock.Api.Dtos.Loans;

public sealed class ListLoansQuery
{
    public string? Status { get; set; }
    // Truthy = overdue-only. Node accepts any truthy string ("true", "1");
    // we model as nullable string and treat any non-empty value as enabled
    // to preserve that behavior.
    public string? Overdue { get; set; }
    public string? Search { get; set; }
    public Guid? CoachId { get; set; }
    public Guid? TeamId { get; set; }
    public DateTime? FromDate { get; set; }
    public DateTime? ToDate { get; set; }
    public int Page { get; set; } = 1;
    public int Limit { get; set; } = 20;
}
