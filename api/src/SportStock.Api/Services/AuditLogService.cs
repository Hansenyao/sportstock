using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SportStock.Api.Data;
using SportStock.Api.Data.Entities;
using SportStock.Api.Dtos.AuditLog;
using SportStock.Api.Dtos.Common;

namespace SportStock.Api.Services;

public sealed class AuditLogService(SportStockDbContext db, ILogger<AuditLogService> logger) : IAuditLogService
{
    public async Task LogAsync(string action, Guid? clubId, Guid? userId,
        string? entityType = null, Guid? entityId = null,
        object? meta = null, string? ipAddress = null)
    {
        try
        {
            var log = new AuditLog
            {
                Id         = Guid.NewGuid(),
                Action     = action,
                ClubId     = clubId,
                UserId     = userId,
                EntityType = entityType,
                EntityId   = entityId,
                Meta       = meta is null ? null : JsonDocument.Parse(JsonSerializer.Serialize(meta)),
                IpAddress  = ipAddress,
                CreatedAt  = DateTime.UtcNow,
            };
            db.AuditLogs.Add(log);
            await db.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "AuditLog write failed for action={Action}", action);
            // Never propagate — audit failure must not break the main flow
        }
    }

    public async Task<PaginatedResult<AuditLogDto>> ListAsync(AuditLogQuery q, Guid? clubId)
    {
        var query = db.AuditLogs.AsQueryable();

        if (clubId.HasValue)
            query = query.Where(l => l.ClubId == clubId);
        if (q.FilterClubId.HasValue)
            query = query.Where(l => l.ClubId == q.FilterClubId);
        if (q.From.HasValue)
            query = query.Where(l => l.CreatedAt >= q.From.Value.UtcDateTime);
        if (q.To.HasValue)
            query = query.Where(l => l.CreatedAt <= q.To.Value.UtcDateTime);
        if (!string.IsNullOrEmpty(q.Action))
            query = query.Where(l => l.Action == q.Action);
        if (!string.IsNullOrEmpty(q.EntityType))
            query = query.Where(l => l.EntityType == q.EntityType);

        var total = await query.CountAsync();
        var items = await query
            .OrderByDescending(l => l.CreatedAt)
            .Skip((q.Page - 1) * q.Limit)
            .Take(q.Limit)
            .Select(l => new AuditLogDto(
                l.Id, l.ClubId, l.UserId, l.Action,
                l.EntityType, l.EntityId, l.CreatedAt,
                db.Users.Where(u => u.Id == l.UserId)
                    .Select(u => u.FirstName + " " + u.LastName)
                    .FirstOrDefault()))
            .ToListAsync();

        return new PaginatedResult<AuditLogDto>
        {
            Data  = items,
            Total = total,
            Page  = q.Page,
            Limit = q.Limit,
        };
    }
}
