using FluentValidation;

namespace SportStock.Api.Dtos.Inventory;

// Status, when present, must be one of the two terminal values. Node never
// allowed re-opening a session, so neither do we. Item-level validation lives
// in the service (it needs DB lookups).
public sealed class UpdateStocktakeRequestValidator : AbstractValidator<UpdateStocktakeRequest>
{
    public UpdateStocktakeRequestValidator()
    {
        RuleFor(x => x.Status)
            .Must(s => s is null || s == "completed" || s == "cancelled")
            .WithMessage("status must be \"completed\" or \"cancelled\"");
    }
}
