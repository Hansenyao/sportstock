using FluentValidation;

namespace SportStock.Api.Dtos.Users;

// All fields optional. Role-value validation runs in UserService.UpdateAsync
// so it emits the same 400 / 409 messages Node does.
public sealed class UpdateUserRequestValidator : AbstractValidator<UpdateUserRequest>
{
    public UpdateUserRequestValidator()
    {
    }
}
