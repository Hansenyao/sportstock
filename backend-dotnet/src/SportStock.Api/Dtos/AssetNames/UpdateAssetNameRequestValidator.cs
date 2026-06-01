using FluentValidation;

namespace SportStock.Api.Dtos.AssetNames;

// Node treats PUT as full-replace (always requires `name`), so we do too.
public sealed class UpdateAssetNameRequestValidator : AbstractValidator<UpdateAssetNameRequest>
{
    public UpdateAssetNameRequestValidator()
    {
        RuleFor(x => x.Name)
            .Must(n => !string.IsNullOrWhiteSpace(n))
            .WithMessage("name is required");
    }
}
