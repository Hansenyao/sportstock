using FluentValidation;

namespace SportStock.Api.Dtos.Auth;

public sealed class ForgotPasswordRequestValidator : AbstractValidator<ForgotPasswordRequest>
{
    public ForgotPasswordRequestValidator()
    {
        // Node responds 200 even for unknown / malformed emails (no
        // enumeration). Keep validation light to preserve that behavior.
        RuleFor(x => x.Email).NotEmpty();
    }
}
