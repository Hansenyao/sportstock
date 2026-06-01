namespace SportStock.Api.Dtos.Inventory;

public sealed class RetireBatchRequest
{
    public int? Quantity { get; set; }
    public string? Notes { get; set; }
}
