using FluentValidation;

namespace SportStock.Api.Dtos.Users;

public sealed class CreateUserRequestValidator : AbstractValidator<CreateUserRequest>
{
    public CreateUserRequestValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty().WithMessage("email is required")
            .EmailAddress().WithMessage("email is invalid");
        RuleFor(x => x.Name).NotEmpty().WithMessage("name is required");
        // Role validation (must be one of the club roles) is enforced in
        // UserService so the 400 wording matches Node.
    }
}
