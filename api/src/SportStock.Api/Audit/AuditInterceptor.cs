using System.Runtime.CompilerServices;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using SportStock.Api.Auth;
using SportStock.Api.Data;
using SportStock.Api.Data.Entities;

namespace SportStock.Api.Audit;

// Registered as singleton so EF Core sees the same interceptor instance in
// every DbContextOptions hash — prevents ManyServiceProvidersCreatedWarning.
// Per-request state is stored in a ConditionalWeakTable keyed by the DbContext
// instance (each HTTP request has its own DbContext, so this is effectively
// per-request). Scoped services (ICurrentUser, AuditContext) are resolved
// on-demand from IHttpContextAccessor.HttpContext.RequestServices.
public sealed class AuditInterceptor(
    IHttpContextAccessor      httpContextAccessor,
    ILogger<AuditInterceptor> logger) : SaveChangesInterceptor
{
    // ── Per-DbContext state ───────────────────────────────────────────────────

    private sealed class PerContextState
    {
        public readonly List<PendingEntry> Pending = new();
        public bool IsWritingAuditLogs;
    }

    private readonly ConditionalWeakTable<DbContext, PerContextState> _states = new();

    private PerContextState State(DbContext ctx) => _states.GetOrCreateValue(ctx);

    // Resolve scoped services from the current HTTP request scope
    private AuditContext?  AuditCtx    => httpContextAccessor.HttpContext?.RequestServices.GetService<AuditContext>();
    private ICurrentUser?  CurrentUser => httpContextAccessor.HttpContext?.RequestServices.GetService<ICurrentUser>();

    // ── Data structures ───────────────────────────────────────────────────────

    private sealed record PendingEntry(
        string                       DefaultAction,
        string                       EntityType,
        Guid?                        EntityId,
        Guid?                        ClubId,
        Dictionary<string, object?>  SnapshotMeta,
        Dictionary<string, object?>? Changes);   // null for Added/Deleted

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
        if (eventData.Context is { } ctx)
        {
            var state = State(ctx);
            if (!state.IsWritingAuditLogs)
                CollectEntries(ctx, state);
        }
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    public override async ValueTask<int> SavedChangesAsync(
        SaveChangesCompletedEventData eventData,
        int                           result,
        CancellationToken             cancellationToken = default)
    {
        if (eventData.Context is not { } ctx)
            return await base.SavedChangesAsync(eventData, result, cancellationToken);

        var state    = State(ctx);
        var auditCtx = AuditCtx;

        if (state.IsWritingAuditLogs)
            return await base.SavedChangesAsync(eventData, result, cancellationToken);

        var hasPending  = state.Pending.Count > 0;
        var hasOverride = auditCtx?.HasOverride ?? false;

        if (!hasPending && !hasOverride)
        {
            state.Pending.Clear();
            auditCtx?.Clear();
            return await base.SavedChangesAsync(eventData, result, cancellationToken);
        }

        state.IsWritingAuditLogs = true;
        try
        {
            var cu     = CurrentUser;
            var userId = cu?.IsAuthenticated == true ? cu.UserId : (Guid?)null;
            var logs   = new List<AuditLog>();

            if (hasPending)
                foreach (var entry in state.Pending)
                    logs.Add(BuildLog(entry, userId, auditCtx));
            else
                logs.Add(BuildStandaloneLog(userId, auditCtx!));

            ((SportStockDbContext)ctx).AuditLogs.AddRange(logs);
            await ctx.SaveChangesAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "AuditInterceptor write failed");
        }
        finally
        {
            state.IsWritingAuditLogs = false;
            state.Pending.Clear();
            auditCtx?.Clear();
        }

        return await base.SavedChangesAsync(eventData, result, cancellationToken);
    }

    public override Task SaveChangesFailedAsync(
        DbContextErrorEventData eventData,
        CancellationToken       cancellationToken = default)
    {
        if (eventData.Context is { } ctx)
        {
            State(ctx).Pending.Clear();
            AuditCtx?.Clear();
        }
        return base.SaveChangesFailedAsync(eventData, cancellationToken);
    }

    // ── Collection ────────────────────────────────────────────────────────────

    private static void CollectEntries(DbContext ctx, PerContextState state)
    {
        state.Pending.Clear();
        foreach (var entry in ctx.ChangeTracker.Entries<IAuditableEntity>())
        {
            var e = entry.Entity;
            switch (entry.State)
            {
                case EntityState.Deleted:
                    state.Pending.Add(new(
                        $"{e.AuditEntityType}.deleted",
                        e.AuditEntityType, e.AuditEntityId, e.AuditClubId,
                        e.GetAuditMeta(), null));
                    break;

                case EntityState.Modified:
                    state.Pending.Add(new(
                        $"{e.AuditEntityType}.updated",
                        e.AuditEntityType, e.AuditEntityId, e.AuditClubId,
                        e.GetAuditMeta(), BuildChanges(entry)));
                    break;

                case EntityState.Added:
                    state.Pending.Add(new(
                        $"{e.AuditEntityType}.created",
                        e.AuditEntityType, e.AuditEntityId, e.AuditClubId,
                        e.GetAuditMeta(), null));
                    break;
            }
        }
    }

    // ── Log building ─────────────────────────────────────────────────────────

    private AuditLog BuildLog(PendingEntry entry, Guid? userId, AuditContext? auditCtx)
    {
        var cu         = CurrentUser;
        var action     = auditCtx?.HasOverride == true ? auditCtx.ActionOverride! : entry.DefaultAction;
        var entityType = auditCtx?.EntityTypeOverride ?? entry.EntityType;
        var entityId   = auditCtx?.EntityIdOverride   ?? entry.EntityId;
        var clubId     = auditCtx?.ClubIdOverride
                         ?? entry.ClubId
                         ?? (cu?.IsAuthenticated == true ? cu.ActiveClubId : null);

        var meta = new Dictionary<string, object?>(entry.SnapshotMeta);
        if (entry.Changes is { Count: > 0 })
            meta["changes"] = entry.Changes;
        MergeAnonymous(meta, auditCtx?.MetaOverride);

        return MakeLog(action, entityType, entityId, clubId, userId, meta);
    }

    private AuditLog BuildStandaloneLog(Guid? userId, AuditContext auditCtx)
    {
        var cu     = CurrentUser;
        var meta   = new Dictionary<string, object?>();
        MergeAnonymous(meta, auditCtx.MetaOverride);
        var clubId = auditCtx.ClubIdOverride
                     ?? (cu?.IsAuthenticated == true ? cu.ActiveClubId : null);
        return MakeLog(auditCtx.ActionOverride!, auditCtx.EntityTypeOverride,
                       auditCtx.EntityIdOverride, clubId, userId, meta);
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
            if (name.EndsWith("At", StringComparison.Ordinal)) continue;
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
