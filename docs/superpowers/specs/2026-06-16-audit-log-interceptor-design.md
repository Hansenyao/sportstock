# Audit Log EF Core Interceptor Design

**Date:** 2026-06-16  
**Status:** Approved

## Problem

The current audit log implementation uses explicit `LogAsync` calls scattered across service methods. This has two issues:

1. `asset_item.deleted` only records the serial number — nav properties (asset type name, brand, model, warehouse) are not captured because they require extra includes that were deemed an afterthought.
2. `asset_batch.updated` requires manual diff code in the service layer.
3. Calls can be forgotten when new service methods are added.

## Design

### Approach: Full EF Core Interceptor (Hybrid Action Names)

A `SaveChangesInterceptor` intercepts all entity changes automatically. Services that perform semantic business events (e.g., loan approval) set a named override via a scoped `AuditContext` before calling `SaveChanges`. All explicit `LogAsync` calls in services are removed.

---

## Components

### 1. `IAuditableEntity` Interface

```csharp
public interface IAuditableEntity
{
    string AuditEntityType { get; }
    Guid? AuditEntityId { get; }
    Guid? AuditClubId { get; }
    Dictionary<string, object?> GetAuditMeta();
}
```

- `AuditEntityType`: string key used as action prefix (e.g., `"asset_item"`, `"loan"`)
- `AuditEntityId`: written to `audit_logs.entity_id`
- `AuditClubId`: written to `audit_logs.club_id`
- `GetAuditMeta()`: returns a flat dictionary of context fields, including resolved nav property names (e.g., `asset_type_name`, `warehouse_name`). Called at the moment of the change — before deletion or during update — so nav properties are still in memory.

**Entities to implement:**
- `Loan`
- `AssetBatch`
- `AssetItem`
- `ClubMembership`

---

### 2. `AuditContext` (Scoped Service)

```csharp
public class AuditContext
{
    public string?  ActionOverride { get; private set; }
    public object?  MetaOverride   { get; private set; }
    public bool     HasOverride    => ActionOverride is not null;

    public void Override(string action, object? meta = null);
    public void Clear();
}
```

Services call `auditContext.Override(action, meta)` before `SaveChangesAsync()` when they need a semantic action name instead of the auto-generated `{entityType}.created/updated/deleted`.

The interceptor reads and clears `AuditContext` in `SavedChangesAsync`.

---

### 3. `AuditInterceptor` (SaveChangesInterceptor)

Registered as a scoped service (so it can receive `ICurrentUser` and `AuditContext`).

#### `SavingChangesAsync` (before DB write)

Iterate `ChangeTracker.Entries<IAuditableEntity>()`:

- **Deleted**: call `GetAuditMeta()` immediately and store a snapshot. The entity is gone after save.
- **Modified**: store `OriginalValues` snapshot (EF tracks these automatically) and current entity reference for post-save diff.
- **Added**: store current entity reference for post-save logging.

#### `SavedChangesAsync` (after DB write)

For each stored snapshot:

1. Determine action name:
   - If `AuditContext.HasOverride` → use `ActionOverride`
   - Else → `"{entityType}.created"`, `"{entityType}.updated"`, or `"{entityType}.deleted"`

2. Build meta:
   - **Delete**: entity's `GetAuditMeta()` snapshot
   - **Update**: `{ "changes": { "<field>": { "from": oldVal, "to": newVal } } }` — diff of tracked scalar properties, merged with `GetAuditMeta()` context fields
   - **Create**: `GetAuditMeta()` snapshot
   - Merge with `AuditContext.MetaOverride` if present

3. Write `AuditLog` entity (inserted directly via `DbContext`, bypassing interceptor re-entry by using a flag or raw SQL insert).

4. Call `AuditContext.Clear()`.

#### ICurrentUser injection

`ICurrentUser` is injected into the interceptor (scoped lifetime matches the HTTP request). Provides `UserId` and `ActiveClubId` for all log entries. Falls back to entity's own `AuditClubId` if `ICurrentUser.ActiveClubId` is null.

#### IP address

`IHttpContextAccessor` injected to capture request IP.

---

## Data Flow

```
Service method called
  │
  ├─ [Business event only] auditContext.Override("loan.approve")
  │
  └─ await db.SaveChangesAsync()
       │
       ├── AuditInterceptor.SavingChangesAsync
       │     • snapshot Deleted entities (GetAuditMeta)
       │     • snapshot Modified entities (OriginalValues + entity ref)
       │
       ├── EF writes to DB
       │
       └── AuditInterceptor.SavedChangesAsync
             • resolve action name (AuditContext or auto)
             • build meta (diff + context)
             • insert AuditLog rows
             • AuditContext.Clear()
```

---

## Migration of Existing Audit Calls

| Location | Existing call | New approach |
|----------|--------------|--------------|
| `LoanService.ApproveLoanAsync` | `audit.LogAsync("loan.approve", ...)` | `auditContext.Override("loan.approve")` before SaveChanges |
| `LoanService.CheckOutAsync` | `audit.LogAsync("loan.checkout", ...)` | `auditContext.Override("loan.checkout")` |
| `LoanService.ReturnLoanAsync` | `audit.LogAsync("loan.return", ...)` | `auditContext.Override("loan.return")` |
| `MembershipService.InviteAsync` | `audit.LogAsync("membership.invite", ...)` | `auditContext.Override("membership.invite", new { role })` |
| `MembershipService.AcceptAsync` | `audit.LogAsync("membership.accept", ...)` | `auditContext.Override("membership.accept")` |
| `AssetService.UpdateBatchAsync` | `audit.LogAsync("asset_batch.updated", ...)` with manual diff | **Remove** — interceptor auto-diffs |
| `AssetService.DeleteItemAsync` | `audit.LogAsync("asset_item.deleted", ...)` with only SN | **Remove** — interceptor captures full `GetAuditMeta()` snapshot |

`IAuditLogService` is retained for `ListAsync`. `LogAsync` is kept as a fallback but no longer called from services.

---

## Registration

```csharp
// Program.cs
builder.Services.AddScoped<AuditContext>();
builder.Services.AddScoped<AuditInterceptor>();

builder.Services.AddDbContext<SportStockDbContext>((sp, options) =>
{
    options
        .UseNpgsql(connectionString)
        .AddInterceptors(sp.GetRequiredService<AuditInterceptor>());
});
```

The interceptor must be scoped (not singleton) because it depends on scoped services (`ICurrentUser`, `AuditContext`).

---

## Edge Cases

- **AuditLog inserts must not re-trigger the interceptor.** Insert `AuditLog` rows via a secondary `DbContext` instance or a raw SQL insert. Simplest: use a second `IDbContextFactory<SportStockDbContext>` scope.
- **SaveChanges with no IAuditableEntity changes**: interceptor is a no-op.
- **Multiple entities in one SaveChanges**: each gets its own log row. If `AuditContext` is set, the override applies to all rows in that save (sufficient for current usage — each service method saves one logical change).
- **Exceptions in interceptor**: swallowed with a warning log, matching existing `LogAsync` behavior. Never let audit failures break the primary operation.
