using FluentValidation;

namespace SportStock.Api.Dtos.Assets;

// Required-asset_name + total_quantity bounds match the Node 400 errors. The
// asset_name club-ownership check has to happen in the service (it needs DB
// access), so the validator only handles shape and arithmetic constraints.
public sealed class CreateAssetRequestValidator : AbstractValidator<CreateAssetRequest>
{
    public CreateAssetRequestValidator()
    {
        RuleFor(x => x.AssetNameId)
            .NotNull().WithMessage("asset_name_id is required");

        RuleFor(x => x.TotalQuantity)
            .Must(q => q is null || q >= 1)
            .WithMessage("total_quantity must be at least 1");
    }
}
