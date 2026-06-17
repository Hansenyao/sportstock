namespace SportStock.Api.Dtos.Kit;
public record KitDto(Guid Id, string Name, string? Description, bool IsActive, int ActiveLoanCount);
