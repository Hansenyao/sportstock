using FluentValidation;

namespace SportStock.Api.Dtos.Loans;

public sealed class ReturnLoanRequestValidator : AbstractValidator<ReturnLoanRequest>
{
    public ReturnLoanRequestValidator()
    {
        RuleFor(x => x.Items)
            .Must(items => items is { Count: > 0 })
            .WithMessage("items array is required");
    }
}
