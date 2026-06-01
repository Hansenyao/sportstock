using FluentValidation;

namespace SportStock.Api.Dtos.AssetNames;

// Wire-level error message matches Node's `AppError('name is required', 400)`.
// FluentValidation throws → ExceptionHandlingMiddleware emits 400 with the same body shape.
public sealed class CreateAssetNameRequestValidator : AbstractValidator<CreateAssetNameRequest>
{
    public CreateAssetNameRequestValidator()
    {
        RuleFor(x => x.Name)
            .Must(n => !string.IsNullOrWhiteSpace(n))
            .WithMessage("name is required");
    }
}
