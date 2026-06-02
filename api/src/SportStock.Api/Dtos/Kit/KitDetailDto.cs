namespace SportStock.Api.Dtos.Kit;
public record KitDetailDto(Guid Id, string Name, string? Description, bool IsAvailable, List<KitItemDto> Items);
