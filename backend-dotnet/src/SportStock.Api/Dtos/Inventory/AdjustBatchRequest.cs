namespace SportStock.Api.Dtos.Inventory;

// POST /inventory/batches/:batchId/adjust — quantity_delta may be negative.
// We model as nullable so "missing" can be distinguished from 0 (Node throws
// 400 only when the field is undefined/null, but accepts 0).
public sealed class AdjustBatchRequest
{
    public int? QuantityDelta { get; set; }
    public string? Notes { get; set; }
}
