using FluentValidation;

namespace SportStock.Api.Dtos.Auth;

public sealed class VerifyEmailRequestValidator : AbstractValidator<VerifyEmailRequest>
{
    public VerifyEmailRequestValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty().WithMessage("email is required")
            .EmailAddress().WithMessage("email is invalid");
        RuleFor(x => x.Code)
            .NotEmpty().WithMessage("code is required");
    }
}
