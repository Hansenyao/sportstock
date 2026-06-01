# Backend Migration to .NET 10 — Design Spec

| | |
|--|--|
| **Status** | Approved — pending implementation |
| **Author** | Migration planning session |
| **Date** | 2026-05-25 |
| **Scope** | Rewrite `backend/` (Node.js + TypeScript + Express) to .NET 10 (`backend-dotnet/`) with parity to the current Vercel-deployed API |
| **Out of scope** | Azure App Service deployment, CI/CD, Vercel decommissioning, frontend changes, real OTP email, schema changes |

---

## 1. Motivation

Team is more familiar with C#/.NET; long-term maintenance and iteration will be easier on a .NET stack. The current Express backend is small enough (~4,100 LOC, 14 services) that a full rewrite is cheaper than incremental migration, especially since deployment will also move from Vercel to Azure App Service (separate spec) and the database is already on Azure PostgreSQL.

This is a **pure tech-stack migration driven by team skills and deployment fit**, not by performance or feature gaps. The final state is **.NET only** — no dual-stack maintenance.

---

## 2. Constraints

These constraints are locked. Any plan that violates them is out of scope.

1. **Schema is untouched.** `backend/db-init.sql` (schema v4) and all stored procedures, triggers, and seed data remain the single source of truth. The .NET DbContext is a **read-only mirror** — EF Migrations is not enabled, `Database.EnsureCreated()` / `Database.Migrate()` is never called.
2. **Feature freeze.** No new features added during migration. Bugs in current behavior are preserved 1:1; only fix them as a separate PR after parity is reached.
3. **API response shape is preserved byte-for-byte** (except internal timestamps). Frontend requires zero code changes; only `VITE_API_BASE_URL` switches.
4. **Database stays untouched.** Existing `users.password_hash` (bcryptjs `$2a$`/`$2b$`) must continue to authenticate users with no migration. Existing JWTs (HS256, same secret) must continue to validate.
5. **Scope ends at local equivalence.** The .NET service running locally (`dotnet run`) must answer requests identically to the current `backend/` running locally. Azure deployment, CI/CD, and Vercel decommissioning are separate specs.

---

## 3. Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Runtime | **.NET 10 LTS** | Supported through Nov 2028; aligns with VS 2026 default SDK |
| Web framework | **ASP.NET Core Controllers** | 1:1 with current Express controller structure; not Minimal API |
| Data access | **EF Core 10 + Npgsql.EntityFrameworkCore.PostgreSQL** | Entities + DbContext scaffolded by EF Core Power Tools |
| Validation | **FluentValidation 11.x** | Manual `ValidateAndThrowAsync` per action; v11.x is MIT |
| Password hashing | **BCrypt.Net-Next** | Compatible with bcryptjs `$2a$`/`$2b$` format |
| JWT | **Microsoft.AspNetCore.Authentication.JwtBearer** | HS256, same secret, same payload `{ sub, iat, exp }` |
| File storage | **HttpClient → Supabase Storage REST** | No community Supabase SDK |
| Push notifications | **FirebaseAdmin** (official Google NuGet) | |
| CSV | **CsvHelper** | |
| Logging | **Serilog.AspNetCore + Serilog.Sinks.Console** | Console only in this spec; App Insights deferred |
| JSON | **System.Text.Json** | Built-in; no Newtonsoft |
| Email | **Stub `IEmailSender`** | OTP code stays hardcoded `"123456"`; Resend deferred |
| Tests | **xUnit + Microsoft.AspNetCore.Mvc.Testing + Testcontainers.PostgreSql + Respawn + FluentAssertions** | |

---

## 4. Project Structure

```
backend-dotnet/
├── SportStock.sln
├── efpt.config.json                      # EF Core Power Tools config, version-controlled
├── .env.example                          # Lists every env var, values blank
├── src/
│   └── SportStock.Api/
│       ├── SportStock.Api.csproj         # net10.0, SDK-style
│       ├── Program.cs                    # composition root
│       ├── appsettings.json              # defaults, no secrets, committed
│       ├── appsettings.Development.json  # dev env overrides (logging level etc.), committed; no secrets
│       ├── Controllers/                  # 14 controllers, 1:1 with backend/src/controllers/
│       ├── Services/                     # 14 services, 1:1 with backend/src/services/
│       ├── Data/
│       │   ├── SportStockDbContext.cs           # Power Tools-generated
│       │   ├── SportStockDbContext.Partial.cs   # hand-written: OnModelCreatingPartial for missed columns
│       │   ├── Entities/                        # Power Tools-generated, do NOT hand-edit
│       │   │   ├── AssetDepreciationRow.cs      # hand-written keyless result type
│       │   │   └── Extensions/                  # partial classes: PG enum columns + domain methods
│       │   ├── Enums/                           # hand-written C# enums mirroring PG enum types
│       │   └── StoredProcedures.cs              # DbContext extension methods for SP / function calls
│       ├── Dtos/                         # grouped by resource; Validator co-located with DTO
│       │   ├── Auth/
│       │   │   ├── LoginRequest.cs
│       │   │   ├── LoginRequestValidator.cs
│       │   │   ├── RegisterRequest.cs
│       │   │   ├── RegisterRequestValidator.cs
│       │   │   └── ...
│       │   ├── Assets/   Loans/   Teams/   Users/   Clubs/
│       │   ├── AssetNames/   Inventory/   WriteOffs/
│       │   ├── Reports/   Notifications/   Admin/
│       ├── Middleware/
│       │   ├── ExceptionHandlingMiddleware.cs
│       │   ├── CorrelationIdMiddleware.cs
│       │   └── JwtAuthExtensions.cs
│       ├── Auth/
│       │   ├── ICurrentUser.cs
│       │   ├── CurrentUser.cs
│       │   └── RequireRoleAttribute.cs
│       ├── Integrations/
│       │   ├── ISupabaseStorage.cs / SupabaseStorageClient.cs
│       │   ├── IFcmClient.cs / FcmClient.cs
│       │   └── IEmailSender.cs / StubEmailSender.cs
│       ├── Exceptions/
│       │   └── AppException.cs
│       └── Utils/
│           └── DateOnlyJsonConverter.cs
└── tests/
    └── SportStock.Api.Tests/
        ├── SportStock.Api.Tests.csproj   # net10.0, xUnit
        ├── Helpers/
        │   ├── SportStockWebApplicationFactory.cs
        │   ├── DbFixture.cs              # Testcontainers PostgreSQL
        │   ├── AuthHelper.cs
        │   └── HttpClientExtensions.cs
        ├── AuthTests.cs                  # 1:1 with backend/tests/auth.test.ts
        ├── AssetsTests.cs                # 1:1 with assets.test.ts
        ├── LoansTests.cs                 # ...
        ├── ClubsTests.cs
        ├── InventoryTests.cs
        ├── NotificationsTests.cs
        ├── ReportsTests.cs
        └── AdminTests.cs
```

### Conventions

- **Service method signatures match the current Node.js shape:** accept `clubId / userId / role` business parameters directly. No Mediator/CQRS handler abstraction.
- **Repository layer is not used by default.** SQL lives in services (mirroring current style). Extract to a Repository only when a service file grows past ~400 lines or a SQL block is reused.
- **DTO and its Validator live in the same file directory.** `AssetCreateRequest.cs` sits next to `AssetCreateRequestValidator.cs` under `Dtos/Assets/`.
- **Power Tools-generated files must not be hand-edited.** Domain extensions go to `Data/Entities/Extensions/` as partial classes.

---

## 5. Data Access — EF Core 10 + Power Tools

### 5.1 Scaffolding workflow (binding requirement)

- Use the [EF Core Power Tools](https://github.com/ErikEJ/EFCorePowerTools) VS extension to reverse-engineer the schema.
- Save the `efpt.config.json` to `backend-dotnet/` root and commit it. Subsequent runs must produce identical output.
- Power Tools settings:
  - **Use Fluent API** (not Data Annotations)
  - **One entity per file**
  - **DbContext name:** `SportStockDbContext`
  - **Entities namespace:** `SportStock.Api.Data.Entities`
  - **Configurations namespace:** `SportStock.Api.Data.Configurations`
  - **Preserve `// <auto-generated>` file headers**
- Domain extensions (computed properties, helper methods) go into `Data/Entities/Extensions/<EntityName>.cs` as `partial class` — never edit the generated files directly.

### 5.2 Type mappings

| PostgreSQL | C# | Notes |
|------------|-----|-------|
| `UUID` | `Guid` | |
| `VARCHAR / TEXT` | `string` | |
| `NUMERIC(10,2)` / `NUMERIC(12,2)` | `decimal` | **Never `double`** — price and depreciation must not be float |
| `DATE` | `DateOnly` | .NET 6+ type, Npgsql 8+ native; JSON serializer emits `"yyyy-MM-dd"` |
| `TIMESTAMPTZ` | `DateTime` (Kind=Utc) | Matches frontend's `Date.toISOString()` consumption |
| `JSONB` | `string?` (default Power Tools mapping) or strongly-typed via converter | Default treats as opaque string; raise to `JsonDocument` if a service needs structured access |
| `BOOLEAN` | `bool` | |
| **PG enum types** | **C# enum** | See § 5.3 — Power Tools silently drops these columns; we add them via partial classes |

### 5.3 PostgreSQL enum columns (Power Tools gap)

EF Core Power Tools registers `HasPostgresEnum(...)` declarations for each PG enum type but **fails to generate the column property on entity classes**. Six columns in this schema are affected: `users.role`, `asset_batches.status`, `loans.status`, `write_off_orders.source`, `stock_movements.type`, `notifications.type`.

Workaround:

1. Define a C# enum per PG enum under `Data/Enums/`. Member names use PascalCase (e.g., `LoanStatus.CheckedOut` for PG `'checked_out'`).
2. Add the missing property to a partial entity class under `Data/Entities/Extensions/<EntityName>.cs`. **Never edit the auto-generated `Data/Entities/<EntityName>.cs`** — it is rebuilt on every Reverse Engineer refresh.
3. Add Fluent column-name configuration in `Data/SportStockDbContext.Partial.cs` (which implements `OnModelCreatingPartial(ModelBuilder)`).
4. **Three-layer enum wiring** is required end-to-end. Skipping any one of the three layers reproduces the failure `42804: column "..." is of type ... but expression is of type integer`:

   - **Layer A — Npgsql data source** (`Program.cs`, before `dataSource.Build()`): registers the driver-level wire translation. C# enum members ↔ PG enum values via `NpgsqlSnakeCaseNameTranslator`.

     ```csharp
     dataSourceBuilder.MapEnum<UserRole>("user_role", new NpgsqlSnakeCaseNameTranslator());
     // ... one call per PG enum
     ```

   - **Layer B — EF Core Npgsql options** (`Program.cs`, inside `UseNpgsql(ds, npg => {...})`): tells EF Core's type system that the enum is a PG enum so parameter generation uses the right OID. Without this EF Core sends `int`.

     ```csharp
     opt.UseNpgsql(ds, npg =>
     {
         npg.MapEnum<UserRole>("user_role", nameTranslator: snake);
         // ... one call per PG enum
     });
     ```

   - **Layer C — model builder** (`SportStockDbContext.Partial.cs` inside `OnModelCreatingPartial`): declares the enum at the model level and pins each column's `HasColumnType` to the PG enum name.

     ```csharp
     modelBuilder.HasPostgresEnum<UserRole>(name: "user_role", nameTranslator: snake);
     modelBuilder.Entity<User>().Property(u => u.Role)
         .HasColumnName("role").HasColumnType("user_role");
     ```

5. Wire `JsonStringEnumConverter` with `JsonNamingPolicy.SnakeCaseLower` at the API JSON boundary (§ 7.3) so responses emit `"checked_out"` rather than `"CheckedOut"` or numeric ordinals — matching current Node output.

### 5.4 Stored procedure calling convention

### 5.3 Stored procedure calling convention

All stored procedures and functions (5 procedures: `approve_loan`, `reject_loan`, `checkout_loan`, `complete_maintenance`, `retire_batch`; 1 function: `get_asset_depreciation`) are exposed as **DbContext extension methods** in `Data/StoredProcedures.cs`. (Trigger functions like `fn_check_low_stock` and `fn_set_updated_at` are DB-internal and not invoked from .NET.)

```csharp
public static class StoredProcedures
{
    public static Task<int> ApproveLoanAsync(
        this SportStockDbContext db, Guid loanId, Guid approverId, CancellationToken ct = default) =>
        db.Database.ExecuteSqlAsync(
            $"CALL approve_loan({loanId}, {approverId})", ct);

    public static Task<List<AssetDepreciationRow>> GetAssetDepreciationAsync(
        this SportStockDbContext db, Guid batchId, CancellationToken ct = default) =>
        db.Set<AssetDepreciationRow>()
          .FromSql($"SELECT * FROM get_asset_depreciation({batchId})")
          .AsNoTracking()
          .ToListAsync(ct);
}
```

- `ExecuteSqlAsync` and `FromSql` use interpolated strings — parameters are auto-parameterized, no SQL injection.
- Table-valued function return types (`AssetDepreciationRow`) are declared as keyless entities and registered in `OnModelCreating`.

### 5.5 Multi-tenant query filter

All entities with a `club_id` column register a global query filter that scopes every query to the current user's club:

```csharp
modelBuilder.Entity<Asset>().HasQueryFilter(a =>
    _currentUser.ClubId == null || a.ClubId == _currentUser.ClubId);
```

- `ICurrentUser` is injected into the DbContext constructor as a scoped service.
- The `_currentUser.ClubId == null` branch transparently exposes all clubs to `super_admin` (which has no `club_id`).
- Cross-tenant administrative reads use `.IgnoreQueryFilters()` explicitly.
- This **replaces every `WHERE l.club_id = $1`** in the current codebase; tenant isolation moves from "per-query discipline" to "framework default."

### 5.6 Connection pool

- Register with `AddDbContextPool<SportStockDbContext>(opt => opt.UseNpgsql(connectionString))`.
- Pool size defaults to Npgsql's 100 — sufficient for local scope.
- Development environment enables SQL logging: `opt.EnableSensitiveDataLogging().LogTo(Console.WriteLine, LogLevel.Information)`. Production turns it off.

---

## 6. Authentication & Authorization

### 6.1 Password hashing — zero migration

- `BCrypt.Net-Next` (NuGet) — `BCrypt.HashPassword(plaintext, 10)` / `BCrypt.Verify(plaintext, hash)`.
- Compatible with existing `users.password_hash` values produced by `bcryptjs` (both use OpenBSD `$2a$`/`$2b$` format at salt rounds = 10).
- Existing users authenticate with their current passwords on day one.

### 6.2 JWT — zero migration

- `Microsoft.AspNetCore.Authentication.JwtBearer`, HS256.
- `JWT_SECRET` environment variable is sourced from the same value used by the Node.js backend. Tokens issued by either backend validate on the other during cutover.
- Payload carries only `{ sub, iat, exp }` — same as current Node implementation.
- `TokenValidationParameters.ClockSkew = TimeSpan.Zero` (no leniency on expiry).
- Expiry: 7 days (`DateTime.UtcNow.AddDays(7)`), matching `JWT_EXPIRES_IN: '7d'`.

### 6.3 OTP — stub preserved

- `IEmailSender` is a DI interface; default implementation is `StubEmailSender` which logs but does not send.
- `AuthService.GenerateCode()` returns the hardcoded `"123456"` — matching current behavior exactly.
- Both `// TODO: restore real code generation before production` and `// TODO: uncomment before production` comments are carried forward verbatim so the production checklist remains visible.

### 6.4 ICurrentUser

A scoped service injected wherever request-scoped identity is needed (DbContext, Services, Controllers, Validators). Never read `HttpContext` directly outside `CurrentUser.cs`.

```csharp
public interface ICurrentUser
{
    Guid UserId { get; }
    Guid? ClubId { get; }
    string Role { get; }
    string Name { get; }
    string Email { get; }
    bool IsAuthenticated { get; }
}
```

Implementation reads `HttpContext.User.Claims` (`sub` claim) and re-queries the user row from the database on every request to pick up `is_active` / `club_id` / `role` changes — matching `middleware/auth.ts` behavior. This is necessary because the JWT payload only carries `sub`.

### 6.5 Role-based authorization

Routes use a custom `[RequireRole]` attribute (an `Attribute, IAsyncAuthorizationFilter`) that reads `ICurrentUser.Role` and throws `AppException("Forbidden", 403)` on mismatch — guaranteeing the same `{ statusCode, error, message }` JSON shape as every other error path.

```csharp
[HttpPost]
[RequireRole("asset_manager", "club_admin")]
public async Task<IActionResult> Create(...) { ... }
```

Built-in `[Authorize(Roles = ...)]` is **not used** because its default 401/403 responses are plain text and inconsistent with the API's JSON shape.

---

## 7. Cross-cutting Concerns

### 7.1 Exception handling and JSON error shape

Every error response is `{ statusCode, error, message }` with that exact field order. Frontend depends on this shape.

```csharp
public sealed class AppException(string message, int statusCode = 500) : Exception(message)
{
    private static readonly Dictionary<int, string> Names = new()
    {
        [400] = "Bad Request",   [401] = "Unauthorized", [403] = "Forbidden",
        [404] = "Not Found",     [409] = "Conflict",     [422] = "Unprocessable Entity",
        [500] = "Internal Server Error",
    };
    public int StatusCode { get; } = statusCode;
    public string Error { get; } = Names.GetValueOrDefault(statusCode, "Error");
}
```

`ExceptionHandlingMiddleware` catches:

- `AppException` → status code + message from the exception.
- `FluentValidation.ValidationException` → 400 with `Errors.First().ErrorMessage`.
- All other `Exception` → 500 "An unexpected error occurred" (the underlying exception is logged with stack trace).

The middleware is registered **first** in the pipeline (before `UseAuthentication`) so it catches errors from authentication too.

ASP.NET Core defaults that emit non-conforming responses are overridden:
- `ConfigureApiBehaviorOptions(opt => opt.InvalidModelStateResponseFactory = ...)` reshapes 400 ModelState errors.
- 404 endpoint-not-found and 405 method-not-allowed are reshaped via `UseStatusCodePages`.

### 7.2 FluentValidation — manual style

Validators are registered via `AddValidatorsFromAssemblyContaining<Program>()` (assembly scan). Each controller action calls `await validator.ValidateAndThrowAsync(dto)` explicitly:

```csharp
[HttpPost]
public async Task<IActionResult> Create(
    [FromBody] AssetCreateRequest dto,
    [FromServices] IValidator<AssetCreateRequest> validator)
{
    await validator.ValidateAndThrowAsync(dto);
    var result = await _assetService.CreateAsync(dto);
    return Ok(result);
}
```

Rationale: automatic integration (`AddFluentValidationAutoValidation`) routes failures through ModelState, which requires an extra hook to reshape. Manual style produces shorter call chains, better stack traces, and clearer intent.

Validators may inject `SportStockDbContext` / `ICurrentUser` for async DB-aware rules (e.g., "email is already registered", "asset_name exists in catalog", "sum of available_quantity across batches ≥ requested").

### 7.3 JSON serialization

Configured once in `Program.cs`:

```csharp
builder.Services.ConfigureHttpJsonOptions(opt =>
{
    opt.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
    opt.SerializerOptions.DictionaryKeyPolicy = JsonNamingPolicy.SnakeCaseLower;
    opt.SerializerOptions.Converters.Add(new DateOnlyJsonConverter());
    opt.SerializerOptions.Converters.Add(
        new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower));
    opt.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.Never;
});
```

The `JsonStringEnumConverter` with `SnakeCaseLower` ensures `LoanStatus.CheckedOut` serializes as `"checked_out"` — matching the current Node implementation's string output and the underlying PG enum value.

- **`snake_case` output** — matches current `pg` + Express behavior; frontend depends on it.
- DTO fields are `PascalCase` in C# code, transformed at serialization.
- `null` fields are emitted (not omitted) — frontend code paths use `?? null` checks that depend on the field being present.
- `DateOnly` → `"yyyy-MM-dd"`. `DateTime` (UTC) → ISO 8601 with `Z` suffix. `decimal` → JSON number.

### 7.4 Request body size

- `KestrelServerOptions.Limits.MaxRequestBodySize = 1_048_576` (1 MB) — matches current `express.json({ limit: '1mb' })`.
- File uploads (multipart) override per-endpoint via `[RequestSizeLimit]` (see § 8.2).

### 7.5 Correlation ID

`CorrelationIdMiddleware` generates a `Guid` per request, attaches it to:
- `HttpContext.TraceIdentifier`
- Response header `X-Correlation-Id`
- Serilog log context (every log line for that request carries the id)

This is added as part of the migration; the current Node backend has no equivalent. Treated as operational baseline, not a feature.

---

## 8. External Integrations

### 8.1 Supabase Storage

- `ISupabaseStorage` + `SupabaseStorageClient` using `HttpClient` against `{SUPABASE_URL}/storage/v1`.
- Named `HttpClient` registered via `AddHttpClient("supabase", ...)` with `Authorization: Bearer {SERVICE_ROLE_KEY}` default header.
- Methods:
  - `UploadAsync(objectPath, stream, contentType, ct)` → `POST /object/{bucket}/{path}`
  - `DeleteAsync(objectPath, ct)` → `DELETE /object/{bucket}/{path}`
  - `GetPublicUrl(objectPath)` → `{SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}`
- Returned `image_url` shape matches the current Node implementation exactly (verified against existing `asset.service.ts`).

### 8.2 File upload (`multer` → `IFormFile`)

- Controllers accept `IFormFile file` directly (ASP.NET Core native).
- `[RequestSizeLimit(5 * 1024 * 1024)]` per endpoint — 5 MB limit (matches current).
- Allowed MIME types validated in service layer: `image/jpeg`, `image/png`, `image/webp`.
- File content streamed directly to Supabase without intermediate disk write (`memoryStorage` equivalent).

### 8.3 Firebase Cloud Messaging

- `FirebaseAdmin` NuGet (official Google SDK).
- `FirebaseApp.Create(...)` runs once at startup, credentials assembled from `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` env vars.
- `FIREBASE_PRIVATE_KEY.replace("\\n", "\n")` transformation is preserved (current `config/index.ts:30`).
- `IFcmClient.SendToTokenAsync(token, title, body, data)` mirrors current `services/fcm.ts` interface.
- Invalid / expired token handling logic copied 1:1 from current implementation.

### 8.4 CSV

- `CsvHelper` NuGet. Only used by admin bulk-import endpoint.

### 8.5 Email — stub

- `IEmailSender` interface, `StubEmailSender` implementation. Logs the OTP code at `Warning` level. Does not call Resend.
- `IEmailSender` is wired into DI now even though it's a stub, so production switchover later is a one-line registration change.

---

## 9. Configuration

Four-tier ASP.NET Core fallback: `appsettings.json` → `appsettings.{Environment}.json` → environment variables (`__` for nested keys, e.g. `Supabase__ServiceRoleKey`) → User Secrets (dev only). **Both `appsettings.json` and `appsettings.Development.json` are committed and must contain no secrets.** Real values are sourced from User Secrets locally (`dotnet user-secrets set`) or environment variables in deployment.

Strongly-typed options with startup validation:

```csharp
builder.Services.AddOptions<DbOptions>()
    .Bind(builder.Configuration.GetSection("Db"))
    .ValidateDataAnnotations()
    .ValidateOnStart();
```

`ValidateOnStart` ensures missing or malformed config crashes the app at startup, not on the first request.

Environment variables (matching `backend/src/config/index.ts` 1:1):

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | JWT signing secret (must equal current value) |
| `JWT_EXPIRES_IN` | Default `"7d"` |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Config preserved but unused (stub) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_STORAGE_BUCKET` | |
| `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | |
| `PORT` | Default `3000` |
| `ASPNETCORE_ENVIRONMENT` | `Development` / `Production` |

`.env.example` is committed listing every variable with empty values.

### Health endpoint

```csharp
app.MapGet("/health", () => Results.Ok(new { status = "ok", timestamp = DateTime.UtcNow }));
```

Shape matches current Node implementation byte-for-byte. ASP.NET Core's built-in `/healthz` is not used.

---

## 10. Logging

- `Serilog.AspNetCore` + `Serilog.Sinks.Console` only (App Insights is out of scope).
- Default minimum level: `Information` (Development), `Warning` (other).
- Enrichers: `FromLogContext`, `WithCorrelationId` (custom — pulls from `HttpContext.TraceIdentifier`).
- Output template: JSON (machine-parseable) via `CompactJsonFormatter`.

---

## 11. Testing Strategy

### 11.1 Layout

```
tests/SportStock.Api.Tests/
├── Helpers/
│   ├── SportStockWebApplicationFactory.cs   # test host with overridable services
│   ├── DbFixture.cs                         # Testcontainers PostgreSQL, collection-scoped
│   ├── AuthHelper.cs                        # JWT minting, user seeding
│   └── HttpClientExtensions.cs              # GetAsAsync<T>, PostJsonAsAsync<T>
├── AuthTests.cs           # 1:1 with backend/tests/auth.test.ts
├── AssetsTests.cs         # 1:1 with assets.test.ts
├── LoansTests.cs
├── ClubsTests.cs
├── InventoryTests.cs
├── NotificationsTests.cs
├── ReportsTests.cs
└── AdminTests.cs
```

Test file names and per-file test coverage map 1:1 to existing `backend/tests/*.test.ts`. **No new test cases are added**, none are removed (except Clerk-related, since Clerk was removed from the codebase). The goal is to preserve the existing safety net unchanged.

### 11.2 Database — Testcontainers + db-init.sql

A `postgres:16` container is started once per test run (`ICollectionFixture<DbFixture>`). The container runs `backend/db-init.sql` to install schema, stored procedures, triggers, and seed data.

```csharp
public sealed class DbFixture : IAsyncLifetime
{
    public PostgreSqlContainer Container { get; } = new PostgreSqlBuilder()
        .WithImage("postgres:16")
        .WithDatabase("sportstock_test")
        .Build();

    public string ConnectionString => Container.GetConnectionString();

    public async Task InitializeAsync()
    {
        await Container.StartAsync();
        var sql = await File.ReadAllTextAsync("../../../../../backend/db-init.sql");
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(sql, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public Task DisposeAsync() => Container.DisposeAsync().AsTask();
}
```

Rationale:
- Real PostgreSQL is mandatory — SQLite/in-memory cannot run stored procedures, triggers, JSONB, or `gen_random_uuid()`.
- `backend/db-init.sql` is the same schema source used in dev/prod — tests cannot drift to a parallel schema.
- Testcontainers requires only Docker Desktop locally; works on CI without bespoke setup.

### 11.3 Test isolation — Respawn

Each test method runs `Respawn` to reset tables to seed state between tests. Transaction-rollback isolation is unreliable here because the stored procedures may issue their own COMMITs.

### 11.4 ICurrentUser in tests

`SportStockWebApplicationFactory.WithWebHostBuilder` replaces the DI registration:

```csharp
factory.WithWebHostBuilder(b => b.ConfigureServices(svc =>
{
    svc.RemoveAll<ICurrentUser>();
    svc.AddScoped<ICurrentUser>(_ => new TestCurrentUser(testUserId, testClubId, "club_admin", ...));
}));
```

Two styles supported:
- **End-to-end** (auth flow tests): real `POST /auth/login` returns a JWT; subsequent requests carry it via `HttpClient.DefaultRequestHeaders.Authorization`.
- **Pre-authenticated** (most non-auth tests): test harness injects a `TestCurrentUser` directly, skipping the login round-trip.

### 11.5 External dependency stubs

| External | Test double |
|----------|-------------|
| `IFcmClient` | `SpyFcmClient` — records calls, asserts later |
| `IEmailSender` | `SpyEmailSender` — captures OTP codes for verify-email flow tests |
| `ISupabaseStorage` | `InMemorySupabaseStorage` — stores uploaded streams in a dictionary |

The old `backend/tests/__mocks__/clerk-backend.ts` is dropped (Clerk is no longer in the codebase).

### 11.6 Test conventions

- Naming: `MethodName_Should_Expected_When_Condition`
- `[Theory]` + `[InlineData]` for parameterized tests
- `FluentAssertions` for assertions (`result.Should().BeEquivalentTo(...)`)

---

## 12. Migration Phases

Single developer, full-time. Estimated **12 working days** including tests.

| Phase | Scope | Duration |
|-------|-------|----------|
| **0 — Chassis** | Solution, DI, Power Tools scaffold, DbContext, `AppException` + middleware, JwtBearer, `ICurrentUser`, FluentValidation wiring, Serilog, Supabase/FCM/Email registrations, `X-Correlation-Id`, `/health`, options validation, test harness. **No business endpoints yet.** | ~2d |
| **1 — Auth** (template slice) | 8 endpoints: register / verify-email / resend-verification / login / forgot-password / reset-password / change-password / GET me. Validates bcrypt compat, JWT compat, OTP stub, JSON shape. | ~1.5d |
| **2 — Clubs** | Club CRUD. Simplest entity. | ~0.3d |
| **3 — Users** | User CRUD with role validation; coach detail returns `teams[]` array. | ~0.4d |
| **4 — Teams** | REQ-1 already implemented in Node; port as-is. | ~0.3d |
| **5 — Asset Names** | Catalog CRUD. | ~0.3d |
| **6 — Assets** | 3-table model (`asset_names + asset_types + asset_batches`). List endpoint returns aggregated rows with `batches[]` array via projection. | ~1.2d |
| **7 — Inventory** | First SP-calling phase: `adjustBatch` / `retireBatch` / `completeMaintenance`. Movement listing. | ~1d |
| **8 — Loans** | Most complex. 3 SPs (`approve_loan`, `reject_loan`, `checkout_loan`), FIFO batch deduction, 4-bucket return (`good / minor_damage / write_off / lost`) with proportional restoration via `stock_movements` lookup. | ~2d |
| **9 — Write-offs** | Manual write-off CRUD + auto write-off from loan return. | ~0.5d |
| **10 — Reports** | 3 aggregation endpoints: summary / depreciation / loan-usage. Mostly `FromSql` over complex group-bys. | ~1d |
| **11 — Notifications** | FCM push + DB record. | ~0.5d |
| **12 — Admin** | Super-admin cross-tenant listings. Validates `ICurrentUser.ClubId == null` global filter bypass. | ~0.5d |
| **Final** | End-to-end Postman/Bruno trace against both backends; full xUnit suite green; frontend manual smoke test against new backend; update `claude/context.md` + memory. **`backend/` is NOT deleted** — that is a follow-up after Azure deployment is stable. | ~1d |

**Total: ~12 days.**

### Per-phase Definition of Done

Every phase passes the same checklist before being marked complete:

1. `dotnet build` succeeds with **0 warnings, 0 errors**.
2. `dotnet test` runs all tests (including new ones for the current phase) **all green**.
3. VS 2026 "Build Solution" succeeds with no warnings.
4. Every endpoint of the phase is exercised against the new backend via Postman/Bruno, and the response body matches the current Node backend byte-for-byte (excluding timestamps and any field whose underlying random source differs, e.g., UUIDs).
5. `ICurrentUser` is the only source of identity — no controller or service reads `HttpContext` directly.
6. Service files crossing ~400 lines should extract a Repository — exceptions allowed but justified in the commit message (e.g., `loan.service` may legitimately exceed this).

---

## 13. Acceptance Criteria

The migration is complete when:

1. All 12 phases marked done per the Definition of Done above.
2. The 8 xUnit test files (`AuthTests` through `AdminTests`) cover every test case that existed in the corresponding jest file (minus Clerk-related).
3. Running `dotnet run` from `backend-dotnet/src/SportStock.Api/` produces an API that the existing frontend (with `VITE_API_BASE_URL` pointed at it) can drive through every page in the dashboard with no JavaScript errors and no UI regressions.
4. The full end-to-end loan flow runs identically on both backends: login → create asset → submit loan → approve → checkout → confirm return → write-off → report.
5. VS 2026 opens `SportStock.sln` with no errors or warnings; "Build → Build Solution" succeeds; "Run tests" succeeds (Docker Desktop running).
6. `.env.example` is committed and lists every required environment variable.
7. `efpt.config.json` is committed; a fresh "Reverse Engineer" run from EF Core Power Tools produces an identical-content diff (no spurious changes).
8. `backend/` directory still exists, untouched. Deletion is a separate PR after Azure deployment is stable.

---

## 14. Out of Scope (Deferred)

The following are explicitly **not** part of this spec and require separate planning:

- Azure App Service provisioning, configuration, deployment.
- CI/CD pipeline (GitHub Actions, etc.).
- Vercel backend decommissioning.
- Real OTP email via Resend (`StubEmailSender` is the placeholder).
- Application Insights / production observability wiring.
- Frontend `VITE_API_BASE_URL` cutover.
- Deletion of `backend/` directory.
- Schema changes or new features (feature freeze in effect).

---

## 15. Known Risks

| Risk | Mitigation |
|------|------------|
| EF Core SP calls behave differently from `pg.query` for OUT params or refcursors | Validated during Phase 7 (Inventory) — first phase that calls SPs. If blocked, fall back to raw ADO.NET via `db.Database.GetDbConnection()` for that specific procedure. |
| Power Tools-generated entity types don't match expected nullability / column types | First Reverse Engineer in Phase 0 produces the entire model; any mismatches are resolved before any service code is written. |
| JSON `snake_case` policy emits a field name differently from current `pg` output for compound names (e.g., `createdAt` vs `created_at`) | Phase 1 Postman byte-by-byte comparison catches all such cases before downstream phases inherit the bug. |
| Bcryptjs `$2y$` variant (PHP-style) in any existing hashes | Verified: `seed-admin.ts` uses bcryptjs default which produces `$2a$`. BCrypt.Net-Next accepts both `$2a$` and `$2b$`. If any `$2y$` slipped in, BCrypt.Net-Next normalizes it on `Verify`. |
| `DATE` type round-trip causes timezone drift | Npgsql 8+ maps `DATE → DateOnly` natively; JSON serializer emits `"yyyy-MM-dd"` with no time component. Verified during Phase 6 (Assets, which has `purchase_date`). |
| Test container slow startup on first run | Acceptable — only affects first `dotnet test` invocation per session; Testcontainers caches the image. |

---

## 16. Open Questions

None at spec time. All decisions confirmed during the brainstorming session of 2026-05-25.
