using System.Text.Json;

namespace SportStock.Api.Dtos.Assets;

// PUT /api/v1/assets/:id/batches/:batchId — patches a batch's purchase
// metadata. Uses JsonElement-presence semantics so `null` and "missing" are
// distinct (matches Node `data.x !== undefined` vs `data.x === null`).
public sealed class UpdateBatchRequest
{
    public JsonElement? PurchaseDate { get; set; }
    public JsonElement? PurchasePrice { get; set; }
    public JsonElement? UsefulLifeYears { get; set; }
    public JsonElement? Notes { get; set; }
    public string? Status { get; set; }
}
