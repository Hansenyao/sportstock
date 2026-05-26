using FluentValidation;

namespace SportStock.Api.Dtos.Clubs;

// All fields are optional (partial update). Only checks here are pure shape
// checks that should map to 400. The retirement_alert_mode and
// retirement_alert_value rules emit 422 in Node, so they live in
// ClubService.UpdateAsync where we can throw AppException(message, 422).
public sealed class UpdateClubRequestValidator : AbstractValidator<UpdateClubRequest>
{
    public UpdateClubRequestValidator()
    {
        When(x => x.ContactEmail is not null, () =>
            RuleFor(x => x.ContactEmail!).EmailAddress().WithMessage("contact_email is invalid"));
    }
}
