using FluentValidation;

namespace SportStock.Api.Dtos.Auth;

public sealed class ResetPasswordRequestValidator : AbstractValidator<ResetPasswordRequest>
{
    public ResetPasswordRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty();
        RuleFor(x => x.Code).NotEmpty();
        RuleFor(x => x.NewPassword)
            .NotEmpty().WithMessage("Password must be at least 6 characters")
            .MinimumLength(6).WithMessage("Password must be at least 6 characters");
    }
}
