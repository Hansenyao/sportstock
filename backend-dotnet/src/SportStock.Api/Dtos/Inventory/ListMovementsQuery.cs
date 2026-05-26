namespace SportStock.Api.Dtos.Inventory;

public sealed class ListMovementsQuery
{
    public Guid? AssetTypeId { get; set; }
    public string? Type { get; set; }
    public DateTime? FromDate { get; set; }
    public DateTime? ToDate { get; set; }
    public int Page { get; set; } = 1;
    public int Limit { get; set; } = 20;
}
