namespace SportStock.Api.Dtos.Common;

// Mirrors Node's PaginatedResult<T>: { data: T[], total: int, page: int, limit: int }.
// Reused by every list endpoint that supports ?page= + ?limit=.
public sealed class PaginatedResult<T>
{
    public IReadOnlyList<T> Data { get; set; } = Array.Empty<T>();
    public int Total { get; set; }
    public int Page { get; set; }
    public int Limit { get; set; }
}
