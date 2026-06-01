using FluentValidation;

namespace SportStock.Api.Dtos.Auth;

public sealed class ResendVerificationRequestValidator : AbstractValidator<ResendVerificationRequest>
{
    public ResendVerificationRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().WithMessage("email is required");
    }
}
