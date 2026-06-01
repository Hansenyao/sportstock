namespace SportStock.Api.Dtos.Loans;

public sealed class LoanItemInput
{
    public Guid? AssetTypeId { get; set; }
    public int? Quantity { get; set; }
}
