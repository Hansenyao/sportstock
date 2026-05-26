using FluentValidation;

namespace SportStock.Api.Dtos.Assets;

// Shape-only — status enum validation happens in the service so the wire
// error matches Node's message format.
public sealed class UpdateBatchRequestValidator : AbstractValidator<UpdateBatchRequest>
{
    public UpdateBatchRequestValidator() { }
}
