using FluentValidation;

namespace SportStock.Api.Dtos.Inventory;

public sealed class MaintenanceBatchRequestValidator : AbstractValidator<MaintenanceBatchRequest>
{
    public MaintenanceBatchRequestValidator()
    {
        RuleFor(x => x.QuantityRestored)
            .NotNull().WithMessage("quantity_restored is required");
    }
}
