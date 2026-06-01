using FluentValidation;

namespace SportStock.Api.Dtos.Inventory;

public sealed class RetireBatchRequestValidator : AbstractValidator<RetireBatchRequest>
{
    public RetireBatchRequestValidator()
    {
        RuleFor(x => x.Quantity)
            .Must(q => q is not null && q >= 1)
            .WithMessage("Positive quantity is required");
    }
}
