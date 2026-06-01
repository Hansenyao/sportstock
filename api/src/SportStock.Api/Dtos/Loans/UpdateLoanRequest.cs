using System.Text.Json;

namespace SportStock.Api.Dtos.Loans;

// PATCH /loans/:id — all fields optional. Items, when present, replaces the
// entire loan_items collection (Node DELETE-then-INSERT semantics). TeamId
// uses JsonElement-presence so explicit-null (clear) is distinguishable from
// missing (preserve).
public sealed class UpdateLoanRequest
{
    public IList<LoanItemInput>? Items { get; set; }
    public DateOnly? DueDate { get; set; }
    public string? Reason { get; set; }
    public Guid? CoachId { get; set; }
    public JsonElement? TeamId { get; set; }
}
