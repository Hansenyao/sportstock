using SportStock.Api.Dtos.AuditLog;
using SportStock.Api.Dtos.Common;

namespace SportStock.Api.Services;

public interface IAuditLogService
{
    // Fire-and-forget safe — exceptions are swallowed internally
    Task LogAsync(string action, Guid? clubId, Guid? userId,
        string? entityType = null, Guid? entityId = null,
        object? meta = null, string? ipAddress = null);

    Task<PaginatedResult<AuditLogDto>> ListAsync(AuditLogQuery q, Guid? clubId);
}
