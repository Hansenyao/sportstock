using FluentValidation;

namespace SportStock.Api.Dtos.Loans;

public sealed class UpdateLoanRequestValidator : AbstractValidator<UpdateLoanRequest>
{
    public UpdateLoanRequestValidator() { }
}
