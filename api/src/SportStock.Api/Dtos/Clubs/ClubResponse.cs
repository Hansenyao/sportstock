namespace SportStock.Api.Dtos.Clubs;

// Mirrors Node's `SELECT * FROM clubs` response shape 1:1. Snake-case JSON
// translation applies at the serializer.
public sealed class ClubResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? SportType { get; set; }
    public string? Address { get; set; }
    public string? ContactEmail { get; set; }
    public bool IsActive { get; set; }
    public string? LogoUrl { get; set; }
    public int LowStockThreshold { get; set; }
    public string RetirementAlertMode { get; set; } = "percent";
    public int RetirementAlertValue { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
