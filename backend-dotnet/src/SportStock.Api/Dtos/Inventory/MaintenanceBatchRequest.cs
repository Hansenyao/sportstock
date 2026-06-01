namespace SportStock.Api.Dtos.Inventory;

public sealed class MaintenanceBatchRequest
{
    public int? QuantityRestored { get; set; }
    public string? Notes { get; set; }
}
