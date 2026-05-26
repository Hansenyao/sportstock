namespace SportStock.Api.Dtos.Loans;

public sealed class ReturnLoanRequest
{
    public IList<ReturnItemInput>? Items { get; set; }
    public string? Notes { get; set; }
}
