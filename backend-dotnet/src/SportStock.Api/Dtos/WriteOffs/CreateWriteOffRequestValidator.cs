using FluentValidation;

namespace SportStock.Api.Dtos.WriteOffs;

public sealed class CreateWriteOffRequestValidator : AbstractValidator<CreateWriteOffRequest>
{
    public CreateWriteOffRequestValidator()
    {
        RuleFor(x => x.AssetTypeId)
            .NotNull().WithMessage("asset_type_id is required");

        RuleFor(x => x.Quantity)
            .Must(q => q is not null && q >= 1)
            .WithMessage("quantity must be at least 1");
    }
}
