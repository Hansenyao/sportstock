using FluentValidation;

namespace SportStock.Api.Dtos.Teams;

// Shape-only: required-name. Gender / AgeGroup enum-value checks live in
// TeamService so the wire-level error message matches Node verbatim
// ("gender must be one of: Boys, Girls, Mixed").
public sealed class CreateTeamRequestValidator : AbstractValidator<CreateTeamRequest>
{
    public CreateTeamRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("name is required");
    }
}
