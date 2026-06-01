using FluentValidation;

namespace SportStock.Api.Dtos.Loans;

// Shape-only checks — coach-vs-manager-vs-team / due-date-in-future /
// asset_type-belongs-to-club checks happen in LoanService so the wire error
// message matches Node verbatim.
public sealed class CreateLoanRequestValidator : AbstractValidator<CreateLoanRequest>
{
    public CreateLoanRequestValidator()
    {
        RuleFor(x => x.Items)
            .Must(items => items is { Count: > 0 })
            .WithMessage("At least one item is required");

        RuleFor(x => x.DueDate)
            .NotNull().WithMessage("due_date is required");
    }
}
