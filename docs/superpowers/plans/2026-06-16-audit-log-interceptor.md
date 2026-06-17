# Audit Log EF Core Interceptor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ad-hoc `IAuditLogService.LogAsync` calls in services with an EF Core `SaveChangesInterceptor` that auto-captures entity changes, including nav-property names at delete/update time.

**Architecture:** A scoped `AuditInterceptor : SaveChangesInterceptor` snapshots `IAuditableEntity` entries before/after `SaveChanges`, then writes `AuditLog` rows in `SavedChangesAsync`. Services that need semantic action names (e.g. `loan.approve`) set them on a scoped `AuditContext` before calling `SaveChangesAsync`; the interceptor reads and clears that context. Loan events (approve/checkout/return) use stored procedures that bypass EF SaveChanges and keep their explicit `LogAsync` calls.

**Tech Stack:** ASP.NET Core 8, EF Core 8, Npgsql, `Microsoft.EntityFrameworkCore.Diagnostics.SaveChangesInterceptor`

---

## File Map

| Action | Path |
|--------|------|
| **Create** | `api/src/SportStock.Api/Audit/IAuditableEntity.cs` |
| **Create** | `api/src/SportStock.Api/Audit/AuditContext.cs` |
| **Create** | `api/src/SportStock.Api/Audit/AuditInterceptor.cs` |
| **Modify** | `api/src/SportStock.Api/Data/Entities/Extensions/AssetBatch.cs` |
| **Modify** | `api/src/SportStock.Api/Data/Entities/AssetItem.cs` |
| **Modify** | `api/src/SportStock.Api/Data/Entities/ClubMembership.cs` |
| **Modify** | `api/src/SportStock.Api/Data/Entities/Extensions/Loan.cs` |
| **Modify** | `api/src/SportStock.Api/Services/AssetService.cs` |
| **Modify** | `api/src/SportStock.Api/Services/MembershipService.cs` |
| **Modify** | `api/src/SportStock.Api/Program.cs` |

---

## Task 1 — IAuditableEntity + AuditContext

**Files:**
- Create: `api/src/SportStock.Api/Audit/IAuditableEntity.cs`
- Create: `api/src/SportStock.Api/Audit/AuditContext.cs`

- [ ] **Step 1: Create the Audit folder and IAuditableEntity interface**

```csharp
// api/src/SportStock.Api/Audit/IAuditableEntity.cs
namespace SportStock.Api.Audit;

public interface IAuditableEntity
{
    /// <summary>Action prefix, e.g. "asset_item", "loan".</summary>
    string AuditEntityType { get; }
    Guid?  AuditEntityId  { get; }
    Guid?  AuditClubId    { get; }

    /// <summary>
    /// Snapshot of human-readable context fields. Called immediately before delete or during update
    /// while nav properties are still in memory.
    /// </summary>
    Dictionary<string, object?> GetAuditMeta();
}
```

- [ ] **Step 2: Create AuditContext**

```csharp
// api/src/SportStock.Api/Audit/AuditContext.cs
namespace SportStock.Api.Audit;

/// <summary>
/// Scoped per-request store. Services call Override() before SaveChangesAsync()
/// to attach a semantic action name; the interceptor reads and clears it.
/// </summary>
public sealed class AuditContext
{
    public string? ActionOverride     { get; private set; }
    public string? EntityTypeOverride { get; private set; }
    public Guid?   EntityIdOverride   { get; private set; }
    public Guid?   ClubIdOverride     { get; private set; }
    public object? MetaOverride       { get; private set; }
    public bool    HasOverride        => ActionOverride is not null;

    public void Override(
        string  action,
        string? entityType = null,
        Guid?   entityId   = null,
        Guid?   clubId     = null,
        object? meta       = null)
    {
        ActionOverride     = action;
        EntityTypeOverride = entityType;
        EntityIdOverride   = entityId;
        ClubIdOverride     = clubId;
        MetaOverride       = meta;
    }

    public void Clear()
    {
        ActionOverride     = null;
        EntityTypeOverride = null;
        EntityIdOverride   = null;
        ClubIdOverride     = null;
        MetaOverride       = null;
    }
}
```

- [ ] **Step 3: Build the project to verify no errors**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock/api
dotnet build src/SportStock.Api/SportStock.Api.csproj
```

Expected: Build succeeded, 0 errors.

- [ ] **Step 4: Commit**

```bash
git add api/src/SportStock.Api/Audit/
git commit -m "feat(audit): add IAuditableEntity interface and AuditContext"
```

---

## Task 2 — AuditInterceptor + Program.cs wiring

**Files:**
- Create: `api/src/SportStock.Api/Audit/AuditInterceptor.cs`
- Modify: `api/src/SportStock.Api/Program.cs`

- [ ] **Step 1: Create AuditInterceptor**

```csharp
// api/src/SportStock.Api/Audit/AuditInterceptor.cs
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
```

- [ ] **Step 2: Update Program.cs — switch AddDbContextPool → AddDbContext and register audit services**

In `Program.cs`, add these two lines **before** the `AddDbContext` call (around line 84):

```csharp
builder.Services.AddScoped<AuditContext>();
builder.Services.AddScoped<AuditInterceptor>();
```

And replace the existing `AddDbContextPool` block:

```csharp
// OLD (remove this):
builder.Services.AddDbContextPool<SportStockDbContext>((sp, opt) =>
{
    var ds    = sp.GetRequiredService<NpgsqlDataSource>();
    var snake = new NpgsqlSnakeCaseNameTranslator();
    opt.UseNpgsql(ds, npg =>
    {
        npg.MapEnum<ClubRole>("club_role", nameTranslator: snake);
        npg.MapEnum<AssetItemStatus>("asset_item_status", nameTranslator: snake);
        npg.MapEnum<LoanStatus>("loan_status", nameTranslator: snake);
        npg.MapEnum<WriteOffSource>("write_off_source", nameTranslator: snake);
        npg.MapEnum<StockMovementType>("stock_movement_type", nameTranslator: snake);
        npg.MapEnum<NotificationType>("notification_type", nameTranslator: snake);
    });
    if (builder.Environment.IsDevelopment())
        opt.EnableSensitiveDataLogging();
});
```

```csharp
// NEW (replace with):
builder.Services.AddDbContext<SportStockDbContext>((sp, opt) =>
{
    var ds    = sp.GetRequiredService<NpgsqlDataSource>();
    var snake = new NpgsqlSnakeCaseNameTranslator();
    opt.UseNpgsql(ds, npg =>
    {
        npg.MapEnum<ClubRole>("club_role", nameTranslator: snake);
        npg.MapEnum<AssetItemStatus>("asset_item_status", nameTranslator: snake);
        npg.MapEnum<LoanStatus>("loan_status", nameTranslator: snake);
        npg.MapEnum<WriteOffSource>("write_off_source", nameTranslator: snake);
        npg.MapEnum<StockMovementType>("stock_movement_type", nameTranslator: snake);
        npg.MapEnum<NotificationType>("notification_type", nameTranslator: snake);
    });
    opt.AddInterceptors(sp.GetRequiredService<AuditInterceptor>());
    if (builder.Environment.IsDevelopment())
        opt.EnableSensitiveDataLogging();
});
```

Also add the using at the top of Program.cs:
```csharp
using SportStock.Api.Audit;
```

- [ ] **Step 3: Build to verify**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock/api
dotnet build src/SportStock.Api/SportStock.Api.csproj
```

Expected: Build succeeded, 0 errors. The interceptor exists but no entities implement `IAuditableEntity` yet — it's a no-op at runtime.

- [ ] **Step 4: Commit**

```bash
git add api/src/SportStock.Api/Audit/AuditInterceptor.cs api/src/SportStock.Api/Program.cs
git commit -m "feat(audit): add AuditInterceptor, switch DbContext to support scoped interceptor"
```

---

## Task 3 — AssetBatch: implement IAuditableEntity + update AssetService batch update

**Files:**
- Modify: `api/src/SportStock.Api/Data/Entities/Extensions/AssetBatch.cs`
- Modify: `api/src/SportStock.Api/Services/AssetService.cs`

- [ ] **Step 1: Implement IAuditableEntity on AssetBatch**

Replace the full content of `api/src/SportStock.Api/Data/Entities/Extensions/AssetBatch.cs`:

```csharp
using SportStock.Api.Audit;

namespace SportStock.Api.Data.Entities;

// Status is now per asset_item; batch-level status derived from asset_items count.
public partial class AssetBatch : IAuditableEntity
{
    public string AuditEntityType => "asset_batch";
    public Guid?  AuditEntityId  => Id;
    public Guid?  AuditClubId    => AssetType?.ClubId;

    public Dictionary<string, object?> GetAuditMeta() => new()
    {
        ["asset_name"]        = AssetType?.AssetName?.Name,
        ["brand"]             = AssetType?.Brand,
        ["model"]             = AssetType?.Model,
        ["purchase_price"]    = PurchasePrice,
        ["purchase_date"]     = PurchaseDate?.ToString("yyyy-MM-dd"),
        ["useful_life_years"] = UsefulLifeYears,
        ["total_quantity"]    = TotalQuantity,
    };
}
```

- [ ] **Step 2: Update UpdateBatchAsync in AssetService to load nav props + remove manual diff and LogAsync**

Read `AssetService.cs` around lines 432–468 to see the current `UpdateBatchAsync` body. Then apply these changes:

**2a.** Change the batch query to include `AssetType` and `AssetName` (needed for `GetAuditMeta()`). Replace the LINQ join query:

```csharp
// OLD:
var batch = await (
    from b in db.AssetBatches.IgnoreQueryFilters()
    join at in db.AssetTypes.IgnoreQueryFilters() on b.AssetTypeId equals at.Id
    where b.Id == batchId && b.AssetTypeId == typeId && at.ClubId == clubId
    select b
).FirstOrDefaultAsync(ct);
```

```csharp
// NEW:
var batch = await db.AssetBatches
    .IgnoreQueryFilters()
    .Include(b => b.AssetType).ThenInclude(t => t.AssetName)
    .Where(b => b.Id == batchId && b.AssetTypeId == typeId && b.AssetType.ClubId == clubId)
    .FirstOrDefaultAsync(ct);
```

**2b.** Remove the manual "old value" captures, the manual diff dict, and the `LogAsync` call. The before state (lines 443–446) is:

```csharp
var oldPrice = batch.PurchasePrice;
var oldDate  = batch.PurchaseDate;
var oldLife  = batch.UsefulLifeYears;
var oldNotes = batch.Notes;
```

Delete those four lines.

**2c.** Keep the mutation lines and `batch.UpdatedAt = DateTime.UtcNow;` unchanged.

**2d.** Remove the entire diff block after `await db.SaveChangesAsync(ct);`:

```csharp
// DELETE everything from here:
var changes = new Dictionary<string, object?>();
if (batch.PurchasePrice != oldPrice)    changes["purchase_price"]    = new { from = oldPrice, to = batch.PurchasePrice };
if (batch.PurchaseDate  != oldDate)     changes["purchase_date"]     = new { from = oldDate?.ToString(), to = batch.PurchaseDate?.ToString() };
if (batch.UsefulLifeYears != oldLife)   changes["useful_life_years"] = new { from = oldLife, to = batch.UsefulLifeYears };
if (batch.Notes         != oldNotes)    changes["notes"]             = new { from = oldNotes, to = batch.Notes };

if (changes.Count > 0)
    await audit.LogAsync("asset_batch.updated", clubId, operatorId,
        "asset_batch", batchId, new { batch_id = batchId, asset_type_id = typeId, changes });
// DELETE to here
```

After these changes `UpdateBatchAsync` should look like:

```csharp
public async Task<AssetTypeResponse> UpdateBatchAsync(
    Guid batchId, Guid typeId, Guid clubId, Guid operatorId, UpdateBatchRequest req, CancellationToken ct = default)
{
    var batch = await db.AssetBatches
        .IgnoreQueryFilters()
        .Include(b => b.AssetType).ThenInclude(t => t.AssetName)
        .Where(b => b.Id == batchId && b.AssetTypeId == typeId && b.AssetType.ClubId == clubId)
        .FirstOrDefaultAsync(ct);
    if (batch is null) throw new AppException("Batch not found", 404);

    ApplyNullableDate(req.PurchaseDate, v => batch.PurchaseDate = v);
    ApplyNullableDecimal(req.PurchasePrice, v => batch.PurchasePrice = v);
    ApplyNullableInt(req.UsefulLifeYears, v => batch.UsefulLifeYears = v);
    ApplyNullableString(req.Notes, v => batch.Notes = v);

    batch.UpdatedAt = DateTime.UtcNow;

    await db.SaveChangesAsync(ct);

    return await GetAsync(typeId, clubId, ct);
}
```

- [ ] **Step 3: Build to verify**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock/api
dotnet build src/SportStock.Api/SportStock.Api.csproj
```

Expected: Build succeeded. If there are unused-variable warnings for `oldPrice` etc., those lines should already be deleted.

- [ ] **Step 4: Commit**

```bash
git add api/src/SportStock.Api/Data/Entities/Extensions/AssetBatch.cs \
        api/src/SportStock.Api/Services/AssetService.cs
git commit -m "feat(audit): AssetBatch implements IAuditableEntity, remove manual batch diff"
```

---

## Task 4 — AssetItem: implement IAuditableEntity + update AssetService item delete

**Files:**
- Modify: `api/src/SportStock.Api/Data/Entities/AssetItem.cs`
- Modify: `api/src/SportStock.Api/Services/AssetService.cs`

- [ ] **Step 1: Implement IAuditableEntity on AssetItem**

`AssetItem.cs` is a hand-written partial class. Add the interface and implementation. Replace the full file:

```csharp
#nullable enable
using System;
using System.Collections.Generic;
using SportStock.Api.Audit;
using SportStock.Api.Data.Enums;

namespace SportStock.Api.Data.Entities;

public partial class AssetItem : IAuditableEntity
{
    public Guid Id { get; set; }
    public Guid ClubId { get; set; }
    public Guid AssetTypeId { get; set; }
    public Guid? BatchId { get; set; }
    public Guid WarehouseId { get; set; }
    public string? SerialNumber { get; set; }
    public AssetItemStatus Status { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public virtual AssetType AssetType { get; set; } = null!;
    public virtual AssetBatch? Batch { get; set; }
    public virtual Warehouse Warehouse { get; set; } = null!;
    public virtual ICollection<LoanItemAssignment> LoanItemAssignments { get; set; } = new List<LoanItemAssignment>();

    // IAuditableEntity
    public string AuditEntityType => "asset_item";
    public Guid?  AuditEntityId   => Id;
    public Guid?  AuditClubId     => ClubId;

    public Dictionary<string, object?> GetAuditMeta() => new()
    {
        ["serial_number"]  = SerialNumber,
        ["asset_name"]     = AssetType?.AssetName?.Name,
        ["brand"]          = AssetType?.Brand,
        ["model"]          = AssetType?.Model,
        ["warehouse_name"] = Warehouse?.Name,
        ["batch_id"]       = BatchId,
        ["status"]         = Status.ToString(),
    };
}
```

- [ ] **Step 2: Update DeleteItemAsync in AssetService to load nav props and remove LogAsync**

Read `AssetService.cs` around lines 626–647 to see the current `DeleteItemAsync`. Apply:

**2a.** Add `.Include` to the item load query so nav properties are in memory when `GetAuditMeta()` is called by the interceptor:

```csharp
// OLD:
var item = await db.AssetItems
    .FirstOrDefaultAsync(i => i.Id == itemId && i.ClubId == clubId)
    ?? throw new AppException("Item not found", 404);
```

```csharp
// NEW:
var item = await db.AssetItems
    .Include(i => i.AssetType).ThenInclude(t => t.AssetName)
    .Include(i => i.Warehouse)
    .FirstOrDefaultAsync(i => i.Id == itemId && i.ClubId == clubId)
    ?? throw new AppException("Item not found", 404);
```

**2b.** Remove the explicit `LogAsync` call after `db.SaveChangesAsync()`:

```csharp
// DELETE:
await audit.LogAsync("asset_item.deleted", clubId, operatorId,
    "asset_item", itemId,
    new { item_id = itemId, asset_type_id = item.AssetTypeId, batch_id = item.BatchId,
          serial_number = item.SerialNumber, warehouse_id = item.WarehouseId });
```

**2c.** Check if `audit` (IAuditLogService) is used anywhere else in `AssetService.cs`:

```bash
grep -n "audit\." /home/yyf/Desktop/Projects/ai-coder/sportstock/api/src/SportStock.Api/Services/AssetService.cs
```

If the grep shows no remaining uses, remove `IAuditLogService audit` from the primary constructor (line ~32) and remove the corresponding `using` if unused:

```csharp
// OLD constructor parameter list (partial — just the audit part):
    IAuditLogService audit) : IAssetService

// NEW (remove audit):
    // remove the parameter; adjust the preceding comma/parameter accordingly
```

- [ ] **Step 3: Build to verify**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock/api
dotnet build src/SportStock.Api/SportStock.Api.csproj
```

Expected: Build succeeded. No references to `audit` remain in AssetService.

- [ ] **Step 4: Commit**

```bash
git add api/src/SportStock.Api/Data/Entities/AssetItem.cs \
        api/src/SportStock.Api/Services/AssetService.cs
git commit -m "feat(audit): AssetItem implements IAuditableEntity, interceptor replaces item.deleted LogAsync"
```

---

## Task 5 — ClubMembership: implement IAuditableEntity + update MembershipService

**Files:**
- Modify: `api/src/SportStock.Api/Data/Entities/ClubMembership.cs`
- Modify: `api/src/SportStock.Api/Services/MembershipService.cs`

- [ ] **Step 1: Implement IAuditableEntity on ClubMembership**

`ClubMembership.cs` is a hand-written file. Add the interface. Replace the full file:

```csharp
#nullable enable
using System;
using System.Collections.Generic;
using SportStock.Api.Audit;
using SportStock.Api.Data.Enums;

namespace SportStock.Api.Data.Entities;

public partial class ClubMembership : IAuditableEntity
{
    public Guid Id { get; set; }
    public Guid ClubId { get; set; }
    public Guid UserId { get; set; }
    public ClubRole Role { get; set; }
    public bool IsActive { get; set; }
    public Guid? InvitedBy { get; set; }
    public DateTime? JoinedAt { get; set; }
    public DateTime CreatedAt { get; set; }

    public virtual Club Club { get; set; } = null!;
    public virtual User User { get; set; } = null!;

    // IAuditableEntity
    public string AuditEntityType => "club_membership";
    public Guid?  AuditEntityId   => Id;
    public Guid?  AuditClubId     => ClubId;

    public Dictionary<string, object?> GetAuditMeta() => new()
    {
        ["user_id"] = UserId,
        ["role"]    = Role.ToString(),
    };
}
```

- [ ] **Step 2: Update MembershipService to use AuditContext instead of LogAsync**

Replace `IAuditLogService audit` with `AuditContext auditContext` in the constructor, and update the two methods.

**Full replacement for `InviteUserAsync` (set Standalone override before SaveChanges):**

```csharp
public async Task<InvitationDto> InviteUserAsync(Guid clubId, Guid inviterId, InviteUserRequest req)
{
    var invitee = await db.Users.FirstOrDefaultAsync(u => u.Id == req.InviteeId && u.IsActive)
        ?? throw new AppException("User not found", 404);

    if (await db.ClubMemberships.AnyAsync(m => m.ClubId == clubId && m.UserId == req.InviteeId && m.IsActive))
        throw new AppException("User is already a member of this club", 409);

    var existing = await db.ClubInvitations.FirstOrDefaultAsync(
        i => i.ClubId == clubId && i.InviteeId == req.InviteeId && i.Status == "pending");
    if (existing is not null) existing.Status = "cancelled";

    var invitation = new ClubInvitation
    {
        Id          = Guid.NewGuid(),
        ClubId      = clubId,
        InviteeId   = req.InviteeId,
        InvitedById = inviterId,
        Role        = req.Role,
        Status      = "pending",
        CreatedAt   = DateTime.UtcNow,
    };
    db.ClubInvitations.Add(invitation);

    // ClubInvitation is not IAuditableEntity — use Standalone override so the
    // interceptor writes a log even though no auditable entity is being saved.
    auditContext.Override(
        "membership.invite",
        entityType: "user",
        entityId:   req.InviteeId,
        clubId:     clubId,
        meta:       new { role = req.Role.ToString() });

    await db.SaveChangesAsync();

    return MapToDto(invitation);
}
```

**Full replacement for `AcceptInvitationAsync` (ClubMembership IS IAuditableEntity):**

```csharp
public async Task<MembershipDto> AcceptInvitationAsync(Guid clubId, Guid invitationId, Guid userId)
{
    var invitation = await db.ClubInvitations
        .FirstOrDefaultAsync(i => i.Id == invitationId && i.ClubId == clubId && i.InviteeId == userId)
        ?? throw new AppException("Invitation not found", 404);

    if (invitation.Status != "pending")
        throw new AppException("Invitation is no longer pending", 409);

    invitation.Status      = "accepted";
    invitation.RespondedAt = DateTime.UtcNow;

    var membership = await db.ClubMemberships
        .FirstOrDefaultAsync(m => m.ClubId == clubId && m.UserId == userId && !m.IsActive);

    if (membership is not null)
    {
        membership.IsActive  = true;
        membership.Role      = invitation.Role;
        membership.JoinedAt  = DateTime.UtcNow;
        membership.InvitedBy = invitation.InvitedById;
    }
    else
    {
        membership = new ClubMembership
        {
            Id        = Guid.NewGuid(),
            ClubId    = clubId,
            UserId    = userId,
            Role      = invitation.Role,
            IsActive  = true,
            InvitedBy = invitation.InvitedById,
            JoinedAt  = DateTime.UtcNow,
        };
        db.ClubMemberships.Add(membership);
    }

    // ClubMembership implements IAuditableEntity — override gives it the semantic name.
    auditContext.Override("membership.accept");

    await db.SaveChangesAsync();

    return new MembershipDto(membership.Id, membership.ClubId, membership.UserId, membership.Role, membership.JoinedAt);
}
```

Also update the constructor declaration:

```csharp
// OLD:
public sealed class MembershipService(SportStockDbContext db, IAuditLogService audit) : IMembershipService

// NEW:
public sealed class MembershipService(SportStockDbContext db, AuditContext auditContext) : IMembershipService
```

Remove the `using SportStock.Api.Services;` import for `IAuditLogService` if it becomes unused; add `using SportStock.Api.Audit;`.

- [ ] **Step 3: Build to verify**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock/api
dotnet build src/SportStock.Api/SportStock.Api.csproj
```

Expected: Build succeeded.

- [ ] **Step 4: Commit**

```bash
git add api/src/SportStock.Api/Data/Entities/ClubMembership.cs \
        api/src/SportStock.Api/Services/MembershipService.cs
git commit -m "feat(audit): ClubMembership implements IAuditableEntity, MembershipService uses AuditContext"
```

---

## Task 6 — Loan: implement IAuditableEntity for loan.created auto-logging

> **Note:** `loan.approve`, `loan.checkout`, and `loan.return` events use PostgreSQL stored procedures (`db.ApproveLoanAsync`, `db.CheckoutLoanAsync`, `db.ReturnLoanAsync`) that bypass EF SaveChanges. **Do not modify LoanService** — keep its three existing `audit.LogAsync` calls.
>
> This task only adds `IAuditableEntity` to `Loan` so that `loan.created` (when a coach submits a new loan request via `db.Loans.Add`) is auto-logged by the interceptor.

**Files:**
- Modify: `api/src/SportStock.Api/Data/Entities/Extensions/Loan.cs`

- [ ] **Step 1: Implement IAuditableEntity on Loan**

Replace `api/src/SportStock.Api/Data/Entities/Extensions/Loan.cs`:

```csharp
using System.Collections.Generic;
using SportStock.Api.Audit;
using SportStock.Api.Data.Enums;

namespace SportStock.Api.Data.Entities;

public partial class Loan : IAuditableEntity
{
    public LoanStatus Status { get; set; }

    // IAuditableEntity
    public string AuditEntityType => "loan";
    public Guid?  AuditEntityId   => Id;
    public Guid?  AuditClubId     => ClubId;

    public Dictionary<string, object?> GetAuditMeta() => new()
    {
        ["coach_id"] = CoachId,
        ["team_id"]  = TeamId,
        ["due_date"] = DueDate.ToString("yyyy-MM-dd"),
        ["reason"]   = Reason,
    };
}
```

- [ ] **Step 2: Build to verify**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock/api
dotnet build src/SportStock.Api/SportStock.Api.csproj
```

Expected: Build succeeded.

- [ ] **Step 3: Commit**

```bash
git add api/src/SportStock.Api/Data/Entities/Extensions/Loan.cs
git commit -m "feat(audit): Loan implements IAuditableEntity for auto-logging loan.created"
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ `IAuditableEntity` interface — Task 1
- ✅ `AuditContext` scoped service — Task 1
- ✅ `AuditInterceptor` (SavingChangesAsync snapshot, SavedChangesAsync write, SaveChangesFailedAsync cleanup) — Task 2
- ✅ Switch `AddDbContextPool` → `AddDbContext` for scoped interceptor — Task 2
- ✅ Re-entry guard (`_isWritingAuditLogs`) — Task 2
- ✅ Standalone log for non-IAuditableEntity saves with AuditContext override (`membership.invite`) — Task 5
- ✅ AssetBatch nav props (`GetAuditMeta` + Include in query) — Task 3
- ✅ AssetItem nav props (`GetAuditMeta` + Include in delete query) — Task 4
- ✅ Remove `asset_batch.updated` LogAsync — Task 3
- ✅ Remove `asset_item.deleted` LogAsync — Task 4
- ✅ Membership events use AuditContext — Task 5
- ✅ Loan events (approve/checkout/return) keep LogAsync (stored proc bypass) — Task 6 note
- ✅ PascalCase → snake_case conversion in diff keys — Task 2 (`ToSnakeCase`)
- ✅ Timestamp properties excluded from auto-diff — Task 2 (`EndsWith("At")`)
- ✅ `SaveChangesFailedAsync` clears pending state — Task 2

**Known limitation:** `AuditContext` allows only one override per `SaveChanges` call. If a service saves multiple IAuditableEntity types in one `SaveChanges` and sets an override, the override action applies to all of them. This is acceptable for current usage (each service method has one logical change per save).
