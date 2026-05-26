# Backend .NET 10 Migration — Implementation Plan

| | |
|--|--|
| **Spec** | [`docs/superpowers/specs/2026-05-25-backend-dotnet-migration-design.md`](../specs/2026-05-25-backend-dotnet-migration-design.md) |
| **Date** | 2026-05-25 |
| **Estimated effort** | ~12 working days, single developer, full-time |
| **Branch** | All Phase work commits directly to `backend-dotnet`. Merge `backend-dotnet` to `main` only after the Final phase. No per-phase branches or tags. |

---

## Pre-flight

Before Phase 0 starts:

- [ ] Install **.NET 10 SDK** (`dotnet --version` ≥ `10.0.x`).
- [ ] Install **Visual Studio 2026** with `ASP.NET and web development` workload.
- [ ] Install **EF Core Power Tools** VS extension (Erik Ejlskov Jensen).
- [ ] Install **Docker Desktop** (required by Testcontainers).
- [ ] Confirm local PostgreSQL access via existing `DATABASE_URL` (used to scaffold from real schema in Phase 0.2).
- [ ] Read the spec end-to-end. Surface any disagreements before writing code.

---

## Phase 0 — Chassis ｜ ~2 days

**Goal:** Working `dotnet run` that serves `/health`, validates JWT, hits the database (no business endpoints yet), and `dotnet test` runs against a Testcontainers PG with one smoke test.

### 0.1 Solution scaffold

- [ ] Create `backend-dotnet/` at repo root.
- [ ] `dotnet new sln -n SportStock -o backend-dotnet`
- [ ] `cd backend-dotnet && dotnet new webapi -n SportStock.Api -o src/SportStock.Api --use-controllers --framework net10.0`
- [ ] `dotnet new xunit -n SportStock.Api.Tests -o tests/SportStock.Api.Tests --framework net10.0`
- [ ] `dotnet sln add src/SportStock.Api tests/SportStock.Api.Tests`
- [ ] `dotnet add tests/SportStock.Api.Tests reference src/SportStock.Api`
- [ ] Delete the template-provided `WeatherForecast` controller and model.
- [ ] Commit: `feat(dotnet): scaffold solution`.

### 0.2 EF Core Power Tools reverse-engineer

- [ ] Run **EF Core Power Tools → Reverse Engineer** against the dev PostgreSQL.
- [ ] Configure (matches the current Power Tools UI; verify each):
  - `Context name` = `SportStockDbContext`
  - `Namespace` = `SportStock.Api` (**no leading whitespace** — Power Tools silently camelCases the first identifier if you paste a value with a leading space)
  - `EntityTypes path` = `Data\Entities`
  - `DbContext path` = `Data`
  - ✅ Pluralize or singularize generated object names
  - ❌ Use DataAnnotations
  - ❌ Customize code using templates (avoid T4 template files cluttering the project)
  - ✅ **Use nullable reference types** (critical — project has `<Nullable>enable</Nullable>`)
  - ✅ Map DateOnly and TimeOnly
  - ❌ Split DbContext into Configuration classes (marked Obsolete by Power Tools — Fluent config now goes inline in `OnModelCreating`; therefore no `Data/Configurations/` subfolder is generated)
- [ ] `efpt.config.json` is saved by Power Tools to the project root (`backend-dotnet/src/SportStock.Api/efpt.config.json`). Commit it.
- [ ] Audit generated entities:
  - Confirm `NUMERIC` columns are `decimal` (never `double`).
  - Confirm `DATE` columns are `DateOnly`.
  - Confirm `TIMESTAMPTZ` columns are `DateTime` (not `DateTimeOffset`).
  - Confirm UUIDs are `Guid`.
  - **Audit for PG enum columns silently dropped by Power Tools** — see spec § 5.3. For each affected column (`users.role`, `asset_batches.status`, `loans.status`, `write_off_orders.source`, `stock_movements.type`, `notifications.type`):
    - [ ] Add a C# enum under `Data/Enums/`
    - [ ] Add the property via a partial class under `Data/Entities/Extensions/`
    - [ ] Add Fluent column-name config in `Data/SportStockDbContext.Partial.cs` (`partial void OnModelCreatingPartial(ModelBuilder)`)
- [ ] Add `Data/Entities/AssetDepreciationRow.cs` — keyless result type for `get_asset_depreciation(batch_id)`. Register in `OnModelCreatingPartial` via `modelBuilder.Entity<AssetDepreciationRow>().HasNoKey().ToView(null);`.
- [ ] Add `Data/StoredProcedures.cs` with extension methods for all 5 procedures (`approve_loan`, `reject_loan`, `checkout_loan`, `complete_maintenance`, `retire_batch`) plus the 1 function (`get_asset_depreciation`). Procedures use `ExecuteSqlAsync($"CALL ...")`; functions use `FromSql($"SELECT * FROM ...")`.
- [ ] Commit: `feat(dotnet): scaffold DbContext via EF Core Power Tools`.

### 0.3 NuGet packages

Add to `SportStock.Api.csproj`:
- [ ] `Microsoft.AspNetCore.Authentication.JwtBearer` (10.*)
- [ ] `Microsoft.EntityFrameworkCore.Design` (10.*)
- [ ] `Npgsql.EntityFrameworkCore.PostgreSQL` — already added by Power Tools in Phase 0.2
- [ ] `BCrypt.Net-Next` (latest 4.x)
- [ ] `FluentValidation` (11.*) — core only; manual style per spec § 7.2
- [ ] `FluentValidation.DependencyInjectionExtensions` (11.*) — for `AddValidatorsFromAssemblyContaining<Program>()`. **Do NOT add `FluentValidation.AspNetCore`** — we are not using automatic validation
- [ ] `FirebaseAdmin` (latest)
- [ ] `CsvHelper` (latest)
- [ ] `Serilog.AspNetCore` (latest) — Console sink is included transitively
- [ ] `Serilog.Formatting.Compact` (latest) — for JSON output formatter

Add to `SportStock.Api.Tests.csproj`:
- [ ] `Microsoft.AspNetCore.Mvc.Testing` (10.*)
- [ ] `Testcontainers.PostgreSql` (latest)
- [ ] `Respawn` (latest)
- [ ] `FluentAssertions` (**7.\*** — last MIT-licensed version; v8+ moved to commercial)
- [ ] `Npgsql` (10.*) — for test fixture's raw SQL setup
- [ ] `Microsoft.EntityFrameworkCore` (10.*) — explicit pin to unify transitive deps (Respawn 7.x pulls EF Core 10.0.4; API uses 10.0.8). Without this pin, the build emits MSB3277 version-conflict warnings.
- [ ] `Microsoft.EntityFrameworkCore.Relational` (10.*) — same unification reason as above

- [ ] Commit: `feat(dotnet): add NuGet dependencies`.

### 0.4 Cross-cutting components

- [ ] `Exceptions/AppException.cs` — exactly as in spec § 7.1.
- [ ] `Middleware/ExceptionHandlingMiddleware.cs` — catches `AppException`, `FluentValidation.ValidationException`, generic `Exception`; emits `{ statusCode, error, message }`.
- [ ] `Utils/DateOnlyJsonConverter.cs` — `yyyy-MM-dd` (omit if .NET 10 built-in converter already does this).
- [ ] `Middleware/CorrelationIdMiddleware.cs` — generates Guid per request, sets `HttpContext.TraceIdentifier`, writes `X-Correlation-Id` response header, pushes to Serilog log context.
- [ ] `Auth/ICurrentUser.cs` + `Auth/CurrentUser.cs` — reads claims from `HttpContext.User`, re-queries `users` row to refresh `is_active` / `role` / `club_id`.
- [ ] `Auth/RequireRoleAttribute.cs` — `Attribute, IAsyncAuthorizationFilter`. Throws `AppException("Forbidden", 403)` on mismatch.
- [ ] Commit: `feat(dotnet): cross-cutting middleware and exception handling`.

### 0.5 Integration clients

- [ ] `Integrations/ISupabaseStorage.cs` + `SupabaseStorageClient.cs` — `HttpClient` against `{SUPABASE_URL}/storage/v1`; methods `UploadAsync`, `DeleteAsync`, `GetPublicUrl`.
- [ ] `Integrations/IFcmClient.cs` + `FcmClient.cs` — wraps `FirebaseMessaging.DefaultInstance`, mirrors current `services/fcm.ts` signature.
- [ ] `Integrations/IEmailSender.cs` + `StubEmailSender.cs` — logs OTP code at Warning level, does not call Resend.
- [ ] Commit: `feat(dotnet): external integration clients`.

### 0.6 Configuration

- [ ] `appsettings.json` — default values for non-secret config.
- [ ] `appsettings.Development.json` — gitignored, holds local secrets.
- [ ] Add `appsettings.Development.json` to `.gitignore`.
- [ ] Strongly-typed Options classes: `DbOptions`, `JwtOptions`, `SupabaseOptions`, `FirebaseOptions`, `ResendOptions` — each bound + `ValidateOnStart`.
- [ ] Env var mapping (matches spec § 9 table).
- [ ] `.env.example` at `backend-dotnet/` root — every var with empty value, committed.
- [ ] Commit: `feat(dotnet): configuration with startup validation`.

### 0.7 Program.cs wiring

Compose root in `Program.cs` (ordered):
- [ ] Serilog bootstrap (read config + Console sink + JSON formatter + `WithCorrelationId` enricher).
- [ ] Service registrations:
  - Build `NpgsqlDataSource` once via `NpgsqlDataSourceBuilder(connectionString)`, register each PG enum with a snake_case translator (mirrors `Data/Enums/*` ↔ PG enum types — see spec § 5.3 three-layer wiring), then call `.Build()`:
    ```csharp
    dataSourceBuilder.MapEnum<UserRole>("user_role", new NpgsqlSnakeCaseNameTranslator());
    // ... one per PG enum (Layer A)
    ```
  - Register `AddDbContextPool<SportStockDbContext>` and **inside the `UseNpgsql` callback also call `npg.MapEnum<T>` for each PG enum (Layer B)** — required in addition to the data-source mapping or EF Core sends `int` for enum parameters:
    ```csharp
    opt.UseNpgsql(dataSource, npg =>
    {
        npg.MapEnum<UserRole>("user_role", nameTranslator: snake);
        // ... one per PG enum (Layer B)
    });
    ```
  - Layer C (model builder + `HasColumnType`) is in `SportStockDbContext.Partial.cs` — see spec § 5.3.
  - `AddHttpContextAccessor()`
  - `AddScoped<ICurrentUser, CurrentUser>()`
  - `AddScoped<ISupabaseStorage, SupabaseStorageClient>()`
  - `AddSingleton<IFcmClient, FcmClient>()` (Firebase init in singleton)
  - `AddScoped<IEmailSender, StubEmailSender>()`
  - `AddHttpClient("supabase", ...)` with default Authorization header
  - `AddValidatorsFromAssemblyContaining<Program>()`
  - `AddAuthentication("Bearer").AddJwtBearer(opt => { ...HS256, ClockSkew=0... })`
  - `AddAuthorization()`
  - `AddControllers()`
  - `ConfigureHttpJsonOptions(...)` — snake_case property/dictionary policies, `DateOnlyJsonConverter`, `JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower)` (so `LoanStatus.CheckedOut` → `"checked_out"`), `DefaultIgnoreCondition = Never`
  - `ConfigureApiBehaviorOptions(opt => opt.InvalidModelStateResponseFactory = ...)` (reshape 400 to JSON shape)
  - `Configure<KestrelServerOptions>(opt => opt.Limits.MaxRequestBodySize = 1_048_576)`
  - `AddCors(...)` (mirror current settings)
- [ ] Pipeline (ordered):
  1. `UseSerilogRequestLogging()`
  2. `UseMiddleware<CorrelationIdMiddleware>()`
  3. `UseMiddleware<ExceptionHandlingMiddleware>()`
  4. `UseStatusCodePages(...)` (reshape 404/405)
  5. Security headers middleware (Helmet equivalent — `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security` in production)
  6. `UseCors(...)`
  7. `UseAuthentication()`
  8. `UseAuthorization()`
  9. `MapGet("/health", ...)` — returns `{ status: "ok", timestamp: <ISO> }`
  10. `MapControllers()`
- [ ] Commit: `feat(dotnet): Program.cs composition root`.

### 0.8 Test harness

- [ ] `Helpers/DbFixture.cs` — dual-mode: if env var `TEST_DATABASE_URL` is set, connect to that Postgres (developer's local instance) and skip the schema replay; otherwise start a `postgres:16` container via Testcontainers and apply `backend/db-init.sql` (spec § 11.2). External mode is convenient on Windows hosts without Docker.
- [ ] `Helpers/SportStockWebApplicationFactory.cs` — overrides DI to point at the test container's connection string; allows overriding `ICurrentUser` per test.
- [ ] `Helpers/AuthHelper.cs` — mints test JWTs, seeds test users/clubs.
- [ ] `Helpers/HttpClientExtensions.cs` — `GetAsAsync<T>`, `PostJsonAsAsync<T>` helpers.
- [ ] `HealthEndpointTests.cs` — single test: `GET /health` returns 200 + `status=ok`.
- [ ] Run `dotnet test` — must pass.
- [ ] Commit: `feat(dotnet): test harness with Testcontainers PG`.

### 0.9 Phase 0 DoD verification

- [ ] `dotnet build` — 0 warnings, 0 errors.
- [ ] `dotnet test` — green (just the `/health` test).
- [ ] Open `SportStock.sln` in VS 2026, Build Solution — succeeds with no warnings.
- [ ] `dotnet run --project src/SportStock.Api/` boots; `curl http://localhost:3000/health` returns expected JSON.
- [ ] Phase 0 complete: 8 commits on `backend-dotnet`, build 0/0, `/health` smoke test green.

---

## Phase 1 — Auth (Template Slice) ｜ ~1.5 days

**Goal:** All 8 auth endpoints work end-to-end; existing users authenticate with their existing passwords; JWTs from old backend validate on new backend.

### 1.1 DTOs + Validators (in `Dtos/Auth/`)

For each request type, create `<Name>Request.cs` and `<Name>RequestValidator.cs`:

- [ ] `RegisterRequest` — nested `club` + `user`; matches current Node payload exactly.
  - Validator: club name non-empty, sport_type non-empty, contact_email valid, user email valid + lowercase normalized, password ≥ 6 chars. **Async DB rules:** user email not already registered, club name not already taken.
- [ ] `VerifyEmailRequest` — `email`, `code`.
  - Validator: both non-empty, email format.
- [ ] `ResendVerificationRequest` — `email`.
- [ ] `LoginRequest` — `email`, `password`.
- [ ] `ForgotPasswordRequest` — `email`.
- [ ] `ResetPasswordRequest` — `email`, `code`, `new_password`.
  - Validator: new_password ≥ 6 chars.
- [ ] `ChangePasswordRequest` — `current_password`, `new_password`.
- [ ] Response DTOs: `LoginResponse { token, user }`, `ProfileResponse`.

### 1.2 AuthService

Port `backend/src/services/auth.service.ts` 1:1:
- [ ] `RegisterAsync(RegisterRequest)` — transactional insert of `clubs` + `users`, then send OTP via `IEmailSender`.
- [ ] `SendVerificationCodeAsync(email, type)` — inserts into `email_verifications`. **Hardcode `GenerateCode() => "123456"`** with `// TODO: restore real code generation before production`.
- [ ] `VerifyEmailAsync(email, code)` — validates from `email_verifications`, marks used, sets `users.email_verified = true`.
- [ ] `LoginAsync(email, password)` — bcrypt verify, returns `LoginResponse`. Honors `email_verified`, `is_active`, `club.is_active`.
- [ ] `ForgotPasswordAsync(email)` — silent if user does not exist (no enumeration).
- [ ] `ResetPasswordAsync(email, code, newPassword)` — validates code, updates `password_hash`.
- [ ] `ChangePasswordAsync(userId, current, new)` — bcrypt verify current, update hash.
- [ ] `GetProfileAsync(userId)` — `GET /auth/me` content.
- [ ] `SignToken(userId)` — uses `Microsoft.IdentityModel.JsonWebTokens.JsonWebTokenHandler.CreateToken`; HS256, payload `{ sub, iat, exp }`, 7-day expiry.

### 1.3 AuthController

- [ ] All 8 endpoints under `[Route("api/v1/auth")]`.
- [ ] Public endpoints (no auth attribute): register / verify-email / resend-verification / login / forgot-password / reset-password.
- [ ] Authenticated endpoints (default `[Authorize]`): change-password / GET me.
- [ ] Each action calls `await validator.ValidateAndThrowAsync(dto)` before delegating to service.
- [ ] Wire JwtBearer to call `ICurrentUser`'s underlying claim parser — confirm `sub` claim flows through.

### 1.4 Tests — `AuthTests.cs`

Port `backend/tests/auth.test.ts` 1:1:
- [ ] `Register_Should_Create_Club_And_User_When_Valid`
- [ ] `Register_Should_Return_409_When_Email_Already_Registered`
- [ ] `Register_Should_Return_409_When_Club_Name_Taken`
- [ ] `Register_Should_Return_400_When_Password_Too_Short`
- [ ] `VerifyEmail_Should_Mark_User_Verified`
- [ ] `VerifyEmail_Should_Return_400_When_Code_Invalid`
- [ ] `Login_Should_Return_Token_When_Credentials_Valid`
- [ ] `Login_Should_Return_401_When_Password_Incorrect`
- [ ] `Login_Should_Return_403_When_Email_Not_Verified`
- [ ] `Login_Should_Return_403_When_User_Deactivated`
- [ ] `Login_Should_Return_403_When_Club_Disabled`
- [ ] `ForgotPassword_Should_Return_200_Even_When_Email_Unknown`
- [ ] `ResetPassword_Should_Update_Password_Hash`
- [ ] `ChangePassword_Should_Return_400_When_Current_Incorrect`
- [ ] `GetMe_Should_Return_Profile`
- [ ] **Cross-backend compat test**: insert a `users` row whose `password_hash` was generated by bcryptjs (capture from current Node backend test); confirm `LoginAsync` accepts it. Insert a JWT issued by the current Node backend (with same `JWT_SECRET`); confirm it validates and `ICurrentUser` populates correctly.

### 1.5 Postman / Bruno parity check

- [ ] Run current Node backend locally on a different port (e.g., 3001).
- [ ] Run new .NET backend locally on port 3000.
- [ ] Hit every Auth endpoint on both, byte-by-byte compare response bodies (excluding timestamps and JWT, which will differ — but JWT structure should be identical: 3 dot-separated base64url parts, payload after decode contains exactly `{ sub, iat, exp }`).
- [ ] Document any byte-level differences. If any are not timestamp/JWT, **fix before moving on**.

### 1.6 Phase 1 DoD

- [ ] `dotnet build` 0/0.
- [ ] `dotnet test` all green (AuthTests + HealthEndpointTests).
- [ ] VS 2026 build solution green.
- [ ] Postman parity check passed.
- [ ] Phase 1 complete: AuthTests green, Postman parity passed.

---

## Phase 2 — Clubs ｜ ~0.3 days

**Endpoints:** `GET /api/v1/clubs/me`, `PUT /api/v1/clubs/me`, `POST /api/v1/clubs/me/logo`.

- [ ] `Dtos/Clubs/UpdateClubRequest.cs` + validator.
- [ ] `Services/ClubService.cs` — get, update, upload logo (via `ISupabaseStorage`).
- [ ] `Controllers/ClubsController.cs`.
- [ ] `Tests/ClubsTests.cs` — port `backend/tests/clubs.test.ts` 1:1.
- [ ] Postman parity check for all club endpoints.
- [ ] DoD checklist (build / test / VS build / parity).

---

## Phase 3 — Users ｜ ~0.4 days

**Endpoints:** `GET /api/v1/users`, `POST /api/v1/users`, `GET /api/v1/users/:id`, `PUT /api/v1/users/:id`, `DELETE /api/v1/users/:id`, `PUT /api/v1/users/:id/activate`.

- [ ] DTOs + validators in `Dtos/Users/` (Create with `password ≥ 6`, role in allowed set).
- [ ] `UserService` — note `GetUser` returns `teams[]` array per REQ-1; preserve.
- [ ] `UsersController` with `[RequireRole("club_admin")]` on create/update/delete.
- [ ] `UsersTests.cs` (note: no existing `users.test.ts` in current backend; create equivalent coverage matching what Node has via integration).
- [ ] Parity check.
- [ ] DoD.

---

## Phase 4 — Teams ｜ ~0.3 days

**Endpoints:** `GET /api/v1/teams`, `POST /api/v1/teams`, `GET /api/v1/teams/:id`, `PUT /api/v1/teams/:id`, `DELETE /api/v1/teams/:id`, `POST /api/v1/teams/:id/members`, `PUT /api/v1/teams/:id/members/:userId`, `DELETE /api/v1/teams/:id/members/:userId`.

- [ ] DTOs + validators in `Dtos/Teams/`. Gender enum (`Boys`, `Girls`, `Mixed`); age_group enum (`U4`–`U21`, `Adult`).
- [ ] Head Coach uniqueness conflict → 409 with clear error (matches current behavior).
- [ ] `TeamService`, `TeamsController`.
- [ ] Tests (no existing `teams.test.ts`; create coverage matching Node behavior).
- [ ] Parity check.
- [ ] DoD.

---

## Phase 5 — Asset Names ｜ ~0.3 days

**Endpoints:** `GET /api/v1/asset-names`, `POST /api/v1/asset-names`, `PUT /api/v1/asset-names/:id`, `DELETE /api/v1/asset-names/:id`.

- [ ] DTOs + validators (unique per `(club_id, name)`).
- [ ] `AssetNameService`, `AssetNamesController`.
- [ ] Tests (no existing standalone file in Node; create coverage matching the new endpoints introduced by REQ-2).
- [ ] Parity check.
- [ ] DoD.

---

## Phase 6 — Assets ｜ ~1.2 days

**Endpoints:** `GET /api/v1/assets` (aggregated), `POST /api/v1/assets` (creates asset_type + first batch), `GET /api/v1/assets/:id`, `PUT /api/v1/assets/:id`, `POST /api/v1/assets/:id/batches`, `PUT /api/v1/assets/:id/batches/:batchId`, `GET /api/v1/assets/:id/batches/:batchId/depreciation`, `POST /api/v1/assets/upload-image`.

- [ ] DTOs in `Dtos/Assets/` — `AssetCreateRequest` (with embedded batch fields), `AssetUpdateRequest`, `BatchCreateRequest`, `BatchUpdateRequest`.
- [ ] List endpoint returns aggregated rows with `batches[]` array. Use `Include(at => at.AssetBatches)` + DTO projection; confirm output shape matches current `JSON_AGG batches` output **byte-for-byte** (especially empty array vs null, field order).
- [ ] `get_asset_depreciation(batch_id)` via `StoredProcedures` extension.
- [ ] Image upload via `IFormFile` → `ISupabaseStorage`.
- [ ] `AssetsTests.cs` — port `backend/tests/assets.test.ts` 1:1.
- [ ] **Critical parity check:** list endpoint with multiple batches, empty batches, and various filters; compare JSON output byte-by-byte.
- [ ] DoD.

---

## Phase 7 — Inventory ｜ ~1 day

First SP-heavy phase. Validates the SP calling convention works.

**Endpoints:** `GET /api/v1/inventory/movements`, `POST /api/v1/inventory/batches/:batchId/adjust`, `POST /api/v1/inventory/batches/:batchId/retire`, `POST /api/v1/inventory/batches/:batchId/maintenance`, `POST /api/v1/inventory/stocktakes`, `GET /api/v1/inventory/stocktakes`, etc.

- [ ] DTOs in `Dtos/Inventory/`.
- [ ] `InventoryService`:
  - `adjustBatch` — inline SQL (no SP) — updates batch quantity, inserts `stock_movements`.
  - `retireBatch` — call SP `retire_batch(p_batch_id)` via `db.RetireBatchAsync(batchId)`.
  - `completeMaintenance` — call SP `complete_maintenance(p_batch_id)`.
  - `listMovements` — JOIN through `asset_batches`, paginated.
  - Stocktake CRUD.
- [ ] `InventoryController`.
- [ ] `InventoryTests.cs` — port `backend/tests/inventory.test.ts` 1:1. **Pay special attention to SP-driven side effects** (verify `stock_movements` rows created, batch status correct).
- [ ] **SP integration verification**: confirm `ExecuteSqlAsync` correctly executes `CALL retire_batch(...)` against a real PG container and side effects are visible in subsequent queries.
- [ ] Parity check.
- [ ] DoD.

---

## Phase 8 — Loans ｜ ~2 days

Most complex single phase.

**Endpoints:** Loan lifecycle — list, create, update, delete, approve, reject, checkout, confirm-return.

- [ ] DTOs in `Dtos/Loans/`:
  - `LoanCreateRequest` (items + optional team_id + due_date).
  - `LoanUpdateRequest`.
  - `LoanReturnRequest` (4 buckets per item: good, minor_damage, write_off, lost).
- [ ] `LoanService` — full port of `loan.service.ts`:
  - `listLoans` — role-aware filtering (coach sees only own loans), supports `status`, `overdue`, `coach_id`, `team_id`, `from_date`, `to_date`, `search`, pagination.
  - `createLoan` / `updateLoan` — async validator checks `SUM(asset_batches.available_quantity)` across all batches for each `asset_type_id`; rejects if insufficient.
  - `approveLoan` → `CALL approve_loan(loan_id, approver_id)`.
  - `rejectLoan` → `CALL reject_loan(loan_id, rejecter_id)`.
  - `checkoutLoan` → `CALL checkout_loan(loan_id, checkout_by)` (FIFO batch deduction in SP).
  - `confirmReturn` — **most complex logic**: read `stock_movements` to find original checkout batches; restore proportionally across batches; create auto write-off orders for `write_off` and `lost` quantities; transition loan status. Port verbatim from current implementation.
- [ ] `LoansController` with `[RequireRole]` per action.
- [ ] `LoansTests.cs` — port `backend/tests/loans.test.ts` 1:1. **Special attention** to: multi-batch FIFO checkout, partial returns, all-4-buckets return, auto write-off creation, role-based filtering.
- [ ] **Cross-backend parity** for the full cycle: create → approve → checkout → return (with 4-bucket split) against both backends.
- [ ] DoD.

---

## Phase 9 — Write-offs ｜ ~0.5 days

**Endpoints:** `GET /api/v1/write-offs`, `POST /api/v1/write-offs` (manual), `GET /api/v1/write-offs/:id`.

- [ ] DTOs in `Dtos/WriteOffs/`.
- [ ] `WriteOffService` — `createWriteOff` deducts FIFO across batches and inserts `stock_movements`.
- [ ] `WriteOffsController`.
- [ ] Tests (no existing `write-offs.test.ts`; create coverage matching Node behavior).
- [ ] Parity check.
- [ ] DoD.

---

## Phase 10 — Reports ｜ ~1 day

**Endpoints:** `GET /api/v1/reports/summary`, `GET /api/v1/reports/depreciation`, `GET /api/v1/reports/loan-usage`.

- [ ] DTOs in `Dtos/Reports/` — query params + response shapes.
- [ ] `ReportService`:
  - `getSummary` — aggregate over `asset_batches + asset_types`.
  - `getDepreciationReport` — per-batch straight-line; either iterate over batches calling `get_asset_depreciation` or do the math in EF (port whichever current impl does).
  - `getLoanUsage` — JOIN through `loan_items + asset_types + asset_names`, grouped + ordered.
- [ ] Use `FromSql<T>` for complex aggregations rather than LINQ acrobatics.
- [ ] `ReportsTests.cs` — port `backend/tests/reports.test.ts` 1:1.
- [ ] Parity check (these are aggregations — verify totals match exactly).
- [ ] DoD.

---

## Phase 11 — Notifications ｜ ~0.5 days

**Endpoints:** `GET /api/v1/notifications`, `PUT /api/v1/notifications/:id/read`, `POST /api/v1/notifications/register-token`, `DELETE /api/v1/notifications/token/:token`.

- [ ] DTOs in `Dtos/Notifications/`.
- [ ] `NotificationService` — port from Node 1:1; includes DB write + FCM push via `IFcmClient`.
- [ ] Internal helper `notifyLowStock(assetTypeId)` etc., consumed by other services.
- [ ] `NotificationsController`.
- [ ] `NotificationsTests.cs` — port `backend/tests/notifications.test.ts` 1:1; uses `SpyFcmClient`.
- [ ] DoD.

---

## Phase 12 — Admin (Super-admin) ｜ ~0.5 days

**Endpoints:** `GET /api/v1/admin/clubs`, `GET /api/v1/admin/clubs/:id`, `PUT /api/v1/admin/clubs/:id/activate`, `GET /api/v1/admin/users`, `GET /api/v1/admin/assets` (cross-tenant listings).

- [ ] DTOs in `Dtos/Admin/`.
- [ ] `AdminService` — uses `.IgnoreQueryFilters()` where global club_id filter must be bypassed.
- [ ] Confirm `ICurrentUser.ClubId == null` correctly disables global filters via the expression filter (no `.IgnoreQueryFilters()` needed at most call sites — verify behavior).
- [ ] `[RequireRole("super_admin")]` on all endpoints.
- [ ] `AdminTests.cs` — port `backend/tests/admin.test.ts` 1:1.
- [ ] Parity check.
- [ ] DoD.

---

## Final — End-to-End Verification & Cleanup ｜ ~1 day

### Final.1 Complete xUnit suite

- [ ] `dotnet test` — all 8 test files green; total test count ≥ matching jest count (minus Clerk-related).
- [ ] Capture test count and pass time; record in commit message.

### Final.2 End-to-end Postman/Bruno trace

Run this trace against both backends sequentially (using a fresh DB), saving requests + responses for diff:

- [ ] `POST /auth/register` (new club + admin)
- [ ] `POST /auth/verify-email`
- [ ] `POST /auth/login`
- [ ] `POST /asset-names` (catalog entry)
- [ ] `POST /assets` (creates asset_type + first batch)
- [ ] `POST /assets/:id/batches` (additional batch)
- [ ] `POST /users` (coach)
- [ ] `POST /teams` + add coach as member
- [ ] As coach: `POST /loans` (submit request)
- [ ] As admin: `POST /loans/:id/approve`
- [ ] As admin: `POST /loans/:id/checkout`
- [ ] As coach: `POST /loans/:id/confirm-return` (with 4-bucket split)
- [ ] `GET /reports/summary`
- [ ] `GET /reports/depreciation`
- [ ] `GET /write-offs`

Diff each response body (excluding timestamps and IDs that are generated independently). **Zero non-trivial differences allowed.**

### Final.3 Frontend smoke test

- [ ] Update local frontend `.env`: `VITE_API_BASE_URL=http://localhost:3000/api/v1`.
- [ ] Run frontend dev server.
- [ ] Manually click through every page in the dashboard:
  - Login / Register / Forgot password
  - Dashboard (overview + pending loans widget)
  - Assets (list, filters, create, edit, write-off, batches)
  - Loans (list, cart, submit, approve, checkout, return)
  - Write-offs (list, create)
  - Users (list, create, edit)
  - Teams (list, create, edit, manage members)
  - Reports (summary, depreciation, loan-usage)
  - Profile / change password
- [ ] DevTools network tab: no 4xx/5xx unexpected responses, no UI errors.

### Final.4 Documentation update

- [ ] Update `claude/context.md` — mark .NET migration phase complete; add note that `backend/` is awaiting cleanup post-deployment.
- [ ] Update `MEMORY.md` — `backend-dotnet-migration.md` memory marked completed; new memory for "Active backend is in `backend-dotnet/`, `backend/` retained for rollback".
- [ ] Update `CLAUDE.md`:
  - Tech stack table: backend row becomes `C# / .NET 10 / ASP.NET Core (Vercel deployment retained for now)`.
  - Add a "Backend directories" note: `backend-dotnet/` is active, `backend/` retained for reference; do not modify the latter.
- [ ] Spec file marked Status: `Implemented`. Date implemented added.

### Final.5 Branch finalization

- [ ] Open PR `backend-dotnet → main`.
- [ ] **Do not delete `backend/`** in this PR. Deletion is a separate PR after Azure deployment is stable (see Out of Scope in spec § 14).

---

## Per-Phase DoD Reference (applies to every phase)

Reproduced for convenience; do not deviate without spec amendment.

1. `dotnet build` — **0 warnings, 0 errors**.
2. `dotnet test` — all tests green, including new ones for the phase.
3. VS 2026: "Build Solution" green, no warnings.
4. Every endpoint of the phase tested against new backend via Postman/Bruno; response body matches current Node backend byte-for-byte (timestamps and independently-generated IDs excluded).
5. `ICurrentUser` is the only source of identity in phase code — no controller / service / validator reads `HttpContext` directly.
6. Service files crossing ~400 lines extract a Repository (exceptions justified in commit message).

---

## Risk Register (operational)

| Risk | Trigger | Response |
|------|---------|----------|
| Power Tools output has unexpected nullability for a column | Phase 0.2 audit | Adjust column nullability in PG or hand-tweak the configuration (document deviation). |
| SP call via `ExecuteSqlAsync` fails (parameter binding, OUT params, refcursors) | Phase 7 first SP call | Fall back to raw ADO.NET for that specific procedure: `db.Database.GetDbConnection().ExecuteAsync(...)`. |
| Postman parity check shows snake_case mismatch on a specific field | Any phase parity check | Add explicit `[JsonPropertyName("field_name")]` on the DTO property; document in commit. |
| `bcryptjs` `$2y$` variant in legacy hashes (PHP-style) | Phase 1 cross-backend compat test | BCrypt.Net-Next handles this natively. If issue, normalize hash on first verify. |
| Testcontainers slow on Windows | First `dotnet test` | Expected — Testcontainers caches images after first pull. |
| EF Core query for aggregated `assets` list emits N+1 queries | Phase 6 parity check (slow) | Use `.Include(at => at.AssetBatches).AsSplitQuery()` or write `FromSql<T>` with explicit join. |
| Front-end breaks because some endpoint emits a field the Node version omitted (or vice versa) | Phase 1 onward parity checks | Diff and fix; this is exactly what the parity check is for. |
