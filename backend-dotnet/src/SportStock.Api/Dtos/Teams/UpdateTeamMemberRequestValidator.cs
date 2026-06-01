using FluentValidation;

namespace SportStock.Api.Dtos.Teams;

public sealed class UpdateTeamMemberRequestValidator : AbstractValidator<UpdateTeamMemberRequest>
{
    public UpdateTeamMemberRequestValidator()
    {
        // team_role enum validation in service.
    }
}
