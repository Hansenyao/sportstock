using FluentValidation;

namespace SportStock.Api.Dtos.Assets;

public sealed class CreateCategoryRequestValidator : AbstractValidator<CreateCategoryRequest>
{
    public CreateCategoryRequestValidator()
    {
        RuleFor(x => x.Name)
            .Must(n => !string.IsNullOrWhiteSpace(n))
            .WithMessage("name is required");
    }
}
