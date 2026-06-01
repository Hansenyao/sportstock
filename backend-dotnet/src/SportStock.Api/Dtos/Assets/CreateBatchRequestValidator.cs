using FluentValidation;

namespace SportStock.Api.Dtos.Assets;

public sealed class CreateBatchRequestValidator : AbstractValidator<CreateBatchRequest>
{
    public CreateBatchRequestValidator()
    {
        RuleFor(x => x.TotalQuantity)
            .Must(q => q is null || q >= 1)
            .WithMessage("total_quantity must be at least 1");
    }
}
