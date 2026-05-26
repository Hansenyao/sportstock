namespace SportStock.Api.Dtos.Clubs;

// Partial-update payload mirroring Node's COALESCE behavior: any property
// left null is preserved unchanged on the underlying row. Use nullable
// reference types and Nullable<int> consistently so the JSON-bound DTO
// reflects "absent vs explicit null" the same way.
public sealed class UpdateClubRequest
{
    public string? Name { get; set; }
    public string? SportType { get; set; }
    public string? Address { get; set; }
    public string? ContactEmail { get; set; }
    public int? LowStockThreshold { get; set; }
    public string? RetirementAlertMode { get; set; }

    // Typed as object? so System.Text.Json yields a JsonElement (rather
    // than failing with a 400 binding error) when callers pass a string
    // like "notanumber". ClubService parses + validates, emitting 422 for
    // any malformed value — matches Node parseInt + 422 semantics exactly.
    public object? RetirementAlertValue { get; set; }
}
