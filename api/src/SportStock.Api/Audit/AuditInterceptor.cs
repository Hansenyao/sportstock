using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Logging;
using SportStock.Api.Auth;
using SportStock.Api.Data;
using SportStock.Api.Data.Entities;

namespace SportStock.Api.Audit;

public sealed class AuditInterceptor(
    ICurrentUser            currentUser,
    AuditContext            auditContext,
    ILogger<AuditInterceptor> logger) : SaveChangesInterceptor
{
    // ── Data structures ──────────────────────────────────────────────────────

    private sealed record PendingEntry(
        string                    DefaultAction,
        string                    EntityType,
        Guid?                     EntityId,
        Guid?                     ClubId,
        Dictionary<string, object?> SnapshotMeta,
        Dictionary<string, object?>? Changes);   // null for Added/Deleted

    private readonly List<PendingEntry> _pending = new();
    private bool _isWritingAuditLogs;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DictionaryKeyPolicy  = JsonNamingPolicy.SnakeCaseLower,
    };

    // ── Interceptor overrides ─────────────────────────────────────────────────

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData       eventData,
        InterceptionResult<int>  result,
        CancellationToken        cancellationToken = default)
    {
        if (!_isWritingAuditLogs && eventData.Context is not null)
            CollectEntries(eventData.Context);

        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    public override async ValueTask<int> SavedChangesAsync(
        SaveChangesCompletedEventData eventData,
        int                           result,
        CancellationToken             cancellationToken = default)
    {
        if (_isWritingAuditLogs)
            return await base.SavedChangesAsync(eventData, result, cancellationToken);

        var hasPending  = _pending.Count > 0;
        var hasOverride = auditContext.HasOverride;

        if ((!hasPending && !hasOverride) || eventData.Context is not { } ctx)
        {
            _pending.Clear();
            auditContext.Clear();
            return await base.SavedChangesAsync(eventData, result, cancellationToken);
        }

        _isWritingAuditLogs = true;
        try
        {
            var userId = currentUser.IsAuthenticated ? currentUser.UserId : (Guid?)null;
            var logs   = new List<AuditLog>();

            if (hasPending)
                foreach (var entry in _pending)
                    logs.Add(BuildLog(entry, userId));
            else
                logs.Add(BuildStandaloneLog(userId));  // no IAuditableEntity, but override set

            ((SportStockDbContext)ctx).AuditLogs.AddRange(logs);
            await ctx.SaveChangesAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "AuditInterceptor write failed");
        }
        finally
        {
            _isWritingAuditLogs = false;
            _pending.Clear();
            auditContext.Clear();
        }

        return await base.SavedChangesAsync(eventData, result, cancellationToken);
    }

    public override Task SaveChangesFailedAsync(
        DbContextErrorEventData eventData,
        CancellationToken       cancellationToken = default)
    {
        _pending.Clear();
        auditContext.Clear();
        return base.SaveChangesFailedAsync(eventData, cancellationToken);
    }

    // ── Collection ────────────────────────────────────────────────────────────

    private void CollectEntries(DbContext ctx)
    {
        _pending.Clear();
        foreach (var entry in ctx.ChangeTracker.Entries<IAuditableEntity>())
        {
            var e = entry.Entity;
            switch (entry.State)
            {
                case EntityState.Deleted:
                    _pending.Add(new(
                        $"{e.AuditEntityType}.deleted",
                        e.AuditEntityType, e.AuditEntityId, e.AuditClubId,
                        e.GetAuditMeta(), null));
                    break;

                case EntityState.Modified:
                    _pending.Add(new(
                        $"{e.AuditEntityType}.updated",
                        e.AuditEntityType, e.AuditEntityId, e.AuditClubId,
                        e.GetAuditMeta(), BuildChanges(entry)));
                    break;

                case EntityState.Added:
                    _pending.Add(new(
                        $"{e.AuditEntityType}.created",
                        e.AuditEntityType, e.AuditEntityId, e.AuditClubId,
                        e.GetAuditMeta(), null));
                    break;
            }
        }
    }

    // ── Log building ─────────────────────────────────────────────────────────

    private AuditLog BuildLog(PendingEntry entry, Guid? userId)
    {
        var action     = auditContext.HasOverride ? auditContext.ActionOverride! : entry.DefaultAction;
        var entityType = auditContext.EntityTypeOverride ?? entry.EntityType;
        var entityId   = auditContext.EntityIdOverride   ?? entry.EntityId;
        var clubId     = auditContext.ClubIdOverride
                         ?? entry.ClubId
                         ?? (currentUser.IsAuthenticated ? currentUser.ActiveClubId : null);

        var meta = new Dictionary<string, object?>(entry.SnapshotMeta);
        if (entry.Changes is { Count: > 0 })
            meta["changes"] = entry.Changes;
        MergeAnonymous(meta, auditContext.MetaOverride);

        return MakeLog(action, entityType, entityId, clubId, userId, meta);
    }

    private AuditLog BuildStandaloneLog(Guid? userId)
    {
        var meta   = new Dictionary<string, object?>();
        MergeAnonymous(meta, auditContext.MetaOverride);
        var clubId = auditContext.ClubIdOverride
                     ?? (currentUser.IsAuthenticated ? currentUser.ActiveClubId : null);
        return MakeLog(auditContext.ActionOverride!, auditContext.EntityTypeOverride,
                       auditContext.EntityIdOverride, clubId, userId, meta);
    }

    private static AuditLog MakeLog(
        string action, string? entityType, Guid? entityId,
        Guid? clubId, Guid? userId, Dictionary<string, object?> meta)
    {
        var metaJson = meta.Count > 0
            ? JsonDocument.Parse(JsonSerializer.Serialize(meta, JsonOpts))
            : null;

        return new AuditLog
        {
            Id         = Guid.NewGuid(),
            Action     = action,
            ClubId     = clubId,
            UserId     = userId,
            EntityType = entityType,
            EntityId   = entityId,
            Meta       = metaJson,
            IpAddress  = null,
            CreatedAt  = DateTime.UtcNow,
        };
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static Dictionary<string, object?> BuildChanges(EntityEntry entry)
    {
        var changes = new Dictionary<string, object?>();
        foreach (var prop in entry.Properties)
        {
            if (!prop.IsModified || prop.Metadata.IsKey()) continue;
            var name = prop.Metadata.Name;
            if (name.EndsWith("At", StringComparison.Ordinal)) continue;  // skip timestamps
            var from = prop.OriginalValue;
            var to   = prop.CurrentValue;
            if (Equals(from, to)) continue;
            changes[ToSnakeCase(name)] = new Dictionary<string, object?> { ["from"] = from, ["to"] = to };
        }
        return changes;
    }

    private static void MergeAnonymous(Dictionary<string, object?> target, object? obj)
    {
        if (obj is null) return;
        foreach (var prop in obj.GetType().GetProperties(
            System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance))
        {
            target[ToSnakeCase(prop.Name)] = prop.GetValue(obj);
        }
    }

    private static string ToSnakeCase(string name)
    {
        var sb = new System.Text.StringBuilder(name.Length + 4);
        for (var i = 0; i < name.Length; i++)
        {
            if (i > 0 && char.IsUpper(name[i]) && !char.IsUpper(name[i - 1]))
                sb.Append('_');
            sb.Append(char.ToLower(name[i]));
        }
        return sb.ToString();
    }
}
