using FluentValidation;

namespace SportStock.Api.Dtos.Auth;

// Input-shape validation only. The DB-aware uniqueness checks for email and
// club name live in AuthService.RegisterAsync so the 409 status code is
// emitted via AppException — keeping ValidationException strictly a 400.
public sealed class RegisterRequestValidator : AbstractValidator<RegisterRequest>
{
    public RegisterRequestValidator()
    {
        RuleFor(x => x.Club).NotNull();
        RuleFor(x => x.Club.Name)
            .NotEmpty().WithMessage("Club name is required");
        RuleFor(x => x.Club.SportType)
            .NotEmpty().WithMessage("Sport type is required");
        RuleFor(x => x.Club.ContactEmail)
            .NotEmpty().WithMessage("Club contact email is required")
            .EmailAddress().WithMessage("Club contact email is invalid");

        RuleFor(x => x.User).NotNull();
        RuleFor(x => x.User.Name)
            .NotEmpty().WithMessage("User name is required");
        RuleFor(x => x.User.Email)
            .NotEmpty().WithMessage("Email is required")
            .EmailAddress().WithMessage("Email is invalid");
        RuleFor(x => x.User.Password)
            .NotEmpty().WithMessage("Password is required")
            .MinimumLength(6).WithMessage("Password must be at least 6 characters");
    }
}
