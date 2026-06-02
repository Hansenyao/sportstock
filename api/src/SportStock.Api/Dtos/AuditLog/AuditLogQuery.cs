namespace SportStock.Api.Dtos.AuditLog;

public record AuditLogQuery(
    DateTimeOffset? From = null,
    DateTimeOffset? To = null,
    string? Action = null,
    string? EntityType = null,
    Guid? FilterClubId = null,
    int Page = 1,
    int Limit = 50);
