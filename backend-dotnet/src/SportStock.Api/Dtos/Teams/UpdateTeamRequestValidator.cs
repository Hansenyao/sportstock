using FluentValidation;

namespace SportStock.Api.Dtos.Teams;

// All fields optional. Enum-value validation runs in TeamService.UpdateAsync.
public sealed class UpdateTeamRequestValidator : AbstractValidator<UpdateTeamRequest>
{
    public UpdateTeamRequestValidator()
    {
    }
}
