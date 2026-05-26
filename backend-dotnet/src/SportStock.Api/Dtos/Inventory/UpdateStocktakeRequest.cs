namespace SportStock.Api.Dtos.Inventory;

// PUT /inventory/stocktake/:id — upsert items and optionally change status.
// Items is optional; status, when set, transitions session to completed or
// cancelled. Notes is appended to the session row on transition only.
public sealed class UpdateStocktakeRequest
{
    public IList<StocktakeItemInput>? Items { get; set; }
    public string? Status { get; set; }
    public string? Notes { get; set; }
}
