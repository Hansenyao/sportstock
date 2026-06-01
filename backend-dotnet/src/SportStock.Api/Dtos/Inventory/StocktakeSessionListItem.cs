namespace SportStock.Api.Dtos.Inventory;

// GET /inventory/stocktake — list projection (ss.* + conducted_by_name).
public sealed class StocktakeSessionListItem
{
    public Guid Id { get; set; }
    public Guid ClubId { get; set; }
    public Guid ConductedBy { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public string ConductedByName { get; set; } = string.Empty;
}
