namespace SportStock.Api.Dtos.AuditLog;

public record AuditLogDto(
    Guid Id, Guid? ClubId, Guid? UserId,
    string Action, string? EntityType, Guid? EntityId,
    DateTime CreatedAt);
