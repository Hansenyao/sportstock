namespace SportStock.Api.Dtos.Assets;

// PUT /api/v1/assets/:id — type-level fields only. Node treats `undefined` as
// "do not touch", null as "clear". We model that by using nullable refs and
// signalling presence with a Sentinel object pattern: each field carries an
// explicit "was the property present in the request body" flag. Because
// System.Text.Json populates only properties present in the payload, every
// property starts as `null` and the service mistakenly thinks "absent = clear".
// To distinguish absent vs explicit-null we pass the raw JsonElement through.
//
// In practice the Node tests only exercise the brand/model paths, which fit
// the simpler nullable model — but we keep the JsonElement wrapper so a future
// "null clears category" use case Just Works.
using System.Text.Json;

public sealed class UpdateAssetRequest
{
    public Guid? AssetNameId { get; set; }
    public JsonElement? Brand { get; set; }
    public JsonElement? Model { get; set; }
    public JsonElement? Size { get; set; }
    public JsonElement? LowStockThreshold { get; set; }
}
