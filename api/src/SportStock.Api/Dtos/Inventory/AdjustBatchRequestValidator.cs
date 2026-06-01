using FluentValidation;

namespace SportStock.Api.Dtos.Inventory;

public sealed class AdjustBatchRequestValidator : AbstractValidator<AdjustBatchRequest>
{
    public AdjustBatchRequestValidator()
    {
        RuleFor(x => x.QuantityDelta)
            .NotNull().WithMessage("quantity_delta is required");
    }
}
