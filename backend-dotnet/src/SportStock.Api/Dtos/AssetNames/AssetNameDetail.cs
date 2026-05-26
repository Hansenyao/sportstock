namespace SportStock.Api.Dtos.AssetNames;

// Returned by POST/PUT — matches Node's RETURNING * shape (no aggregated fields).
public sealed class AssetNameDetail
{
    public Guid Id { get; set; }
    public Guid ClubId { get; set; }
    public string Name { get; set; } = string.Empty;
    public Guid? CategoryId { get; set; }
    public DateTime CreatedAt { get; set; }
}
