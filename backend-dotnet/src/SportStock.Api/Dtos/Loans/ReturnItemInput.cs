namespace SportStock.Api.Dtos.Loans;

// One row of POST /loans/:id/return body.items[]. All four bucket counts
// are required (Node validates sum == original quantity); we keep them as
// non-nullable int so a missing field defaults to 0 and the service's
// "must sum to" check catches it.
public sealed class ReturnItemInput
{
    public Guid LoanItemId { get; set; }
    public int GoodQuantity { get; set; }
    public int MinorDamageQuantity { get; set; }
    public int WriteOffQuantity { get; set; }
    public int LostQuantity { get; set; }
    public string? Notes { get; set; }
}
