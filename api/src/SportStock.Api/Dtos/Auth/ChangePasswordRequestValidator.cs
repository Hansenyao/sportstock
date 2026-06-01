using FluentValidation;

namespace SportStock.Api.Dtos.Auth;

public sealed class ChangePasswordRequestValidator : AbstractValidator<ChangePasswordRequest>
{
    public ChangePasswordRequestValidator()
    {
        RuleFor(x => x.CurrentPassword).NotEmpty();
        RuleFor(x => x.NewPassword)
            .NotEmpty().WithMessage("New password must be at least 6 characters")
            .MinimumLength(6).WithMessage("New password must be at least 6 characters");
    }
}
