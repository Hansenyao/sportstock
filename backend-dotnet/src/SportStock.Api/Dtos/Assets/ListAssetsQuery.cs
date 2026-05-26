namespace SportStock.Api.Dtos.Assets;

// Query-string binding for GET /api/v1/assets. Names use snake_case to match
// the public API surface; ASP.NET Core query-string binding is case-insensitive
// but we keep snake_case here for documentation parity.
public sealed class ListAssetsQuery
{
    public Guid? CategoryId { get; set; }
    public string? Status { get; set; }
    public string? Search { get; set; }
    public int Page { get; set; } = 1;
    public int Limit { get; set; } = 20;
}
