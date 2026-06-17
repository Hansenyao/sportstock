namespace SportStock.Api.Dtos.Loans;

public sealed class LoanItemInput
{
    public Guid? AssetTypeId { get; set; }
    public int? Quantity { get; set; }
    public Guid? KitId { get; set; }
    public string? KitName { get; set; }
    public int? KitQuantity { get; set; }
}
