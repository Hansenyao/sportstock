namespace SportStock.Api.Dtos.WriteOffs;

public sealed class CreateWriteOffRequest
{
    public Guid? AssetTypeId { get; set; }
    public int? Quantity { get; set; }
    public string? Reason { get; set; }
    public string? Notes { get; set; }
}
