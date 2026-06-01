using FluentValidation;

namespace SportStock.Api.Dtos.Teams;

public sealed class AddTeamMemberRequestValidator : AbstractValidator<AddTeamMemberRequest>
{
    public AddTeamMemberRequestValidator()
    {
        RuleFor(x => x.UserId).NotEqual(Guid.Empty).WithMessage("user_id is required");
        // team_role enum validation in service for parity with Node message.
    }
}
