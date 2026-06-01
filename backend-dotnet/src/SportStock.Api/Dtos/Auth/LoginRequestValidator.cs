using FluentValidation;

namespace SportStock.Api.Dtos.Auth;

public sealed class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        // Match the Node behavior: the controller does no shape validation
        // and lets the service emit the generic 401 "Invalid email or
        // password" instead of a 400 "email is required". So validators here
        // are minimal — non-empty only, no email-format check.
        RuleFor(x => x.Email).NotEmpty();
        RuleFor(x => x.Password).NotEmpty();
    }
}
