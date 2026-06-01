using FluentValidation;

namespace SportStock.Api.Dtos.Assets;

// Shape-only — every field on UpdateAssetRequest is optional with explicit
// null vs absent semantics handled in AssetService. Empty validator exists
// because the controller injects IValidator<UpdateAssetRequest>.
public sealed class UpdateAssetRequestValidator : AbstractValidator<UpdateAssetRequest>
{
    public UpdateAssetRequestValidator() { }
}
