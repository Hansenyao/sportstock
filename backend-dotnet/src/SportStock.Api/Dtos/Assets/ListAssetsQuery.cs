using Microsoft.AspNetCore.Mvc;

namespace SportStock.Api.Dtos.Assets;

// Query-string binding for GET /api/v1/assets. The default ASP.NET binder is
// case-insensitive but does NOT translate snake_case to PascalCase, so any
// underscore-bearing param must opt in via [FromQuery(Name = ...)].
public sealed class ListAssetsQuery
{
    [FromQuery(Name = "category_id")] public Guid? CategoryId { get; set; }
    [FromQuery(Name = "status")] public string? Status { get; set; }
    [FromQuery(Name = "search")] public string? Search { get; set; }
    [FromQuery(Name = "page")] public int Page { get; set; } = 1;
    [FromQuery(Name = "limit")] public int Limit { get; set; } = 20;
}
