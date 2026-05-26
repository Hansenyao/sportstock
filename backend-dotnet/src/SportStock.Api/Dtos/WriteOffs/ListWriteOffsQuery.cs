namespace SportStock.Api.Dtos.WriteOffs;

public sealed class ListWriteOffsQuery
{
    public Guid? AssetTypeId { get; set; }
    public string? Source { get; set; }
    public DateTime? FromDate { get; set; }
    public DateTime? ToDate { get; set; }
    public int Page { get; set; } = 1;
    public int Limit { get; set; } = 20;
}
