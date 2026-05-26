namespace SportStock.Api.Dtos.Loans;

public sealed class CreateLoanRequest
{
    public IList<LoanItemInput>? Items { get; set; }
    public DateOnly? DueDate { get; set; }
    public string? Reason { get; set; }
    public Guid? CoachId { get; set; }
    public Guid? TeamId { get; set; }
}
