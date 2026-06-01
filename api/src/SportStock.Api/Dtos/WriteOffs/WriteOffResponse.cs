using SportStock.Api.Data.Enums;

namespace SportStock.Api.Dtos.WriteOffs;

// Mirrors Node WRITE_OFF_SELECT projection: wo.* + denormalized names.
public sealed class WriteOffResponse
{
    public Guid Id { get; set; }
    public Guid ClubId { get; set; }
    public Guid AssetTypeId { get; set; }
    public int Quantity { get; set; }
    public string? Reason { get; set; }
    public WriteOffSource Source { get; set; }
    public Guid? LoanItemId { get; set; }
    public Guid CreatedBy { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public string AssetName { get; set; } = string.Empty;
    public string? AssetImage { get; set; }
    public string? Brand { get; set; }
    public string? Model { get; set; }
    public string? Size { get; set; }
    public string CreatedByName { get; set; } = string.Empty;
}
