using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using SportStock.Api.Data.Entities;
using SportStock.Api.Data.Enums;
using SportStock.Api.Tests.Helpers;

namespace SportStock.Api.Tests;

// Ports backend/tests/reports.test.ts plus augmentation for alert paths.
[Collection("Database")]
public sealed class ReportsTests : IAsyncLifetime, IDisposable
{
    private const string Prefix = "t_rpt_";
    private const string ClubPrefix = "Reports Test ";
    private const string AdminEmail = Prefix + "admin@test.com";
    private const string ManagerEmail = Prefix + "manager@test.com";
    private const string CoachEmail = Prefix + "coach@test.com";

    private readonly DbFixture _dbFixture;
    private readonly SportStockWebApplicationFactory _factory;
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
    };

    private static SportStockWebApplicationFactory? s_factory;
    private static readonly object s_factoryLock = new();

    private Guid _clubId;
    private Guid _managerUserId;
    private Guid _coachUserId;
    private Guid _teamId;

    public ReportsTests(DbFixture dbFixture)
    {
        _dbFixture = dbFixture;
        lock (s_factoryLock)
        {
            s_factory ??= new SportStockWebApplicationFactory().WithDb(dbFixture);
        }
        _factory = s_factory;
    }

    public async Task InitializeAsync()
    {
        await _factory.WithDbContextAsync(async db =>
        {
            await TestData.ResetAuthAsync(db, Prefix, ClubPrefix);
            _clubId = await TestData.CreateClubAsync(db, ClubPrefix + "Club");
            var adminUserId = await TestData.CreateUserAsync(db, AdminEmail);
            await TestData.CreateMembershipAsync(db, _clubId, adminUserId, ClubRole.ClubAdmin);
            _managerUserId = await TestData.CreateUserAsync(db, ManagerEmail);
            await TestData.CreateMembershipAsync(db, _clubId, _managerUserId, ClubRole.AssetManager);
            _coachUserId = await TestData.CreateUserAsync(db, CoachEmail);
            await TestData.CreateMembershipAsync(db, _clubId, _coachUserId, ClubRole.Coach);

            // Seed an asset_name + asset_type + batch for non-empty summary.
            var nameId = Guid.NewGuid();
            db.AssetNames.Add(new AssetName { Id = nameId, ClubId = _clubId, Name = "Report Test Ball" });
            var typeId = Guid.NewGuid();
            db.AssetTypes.Add(new AssetType { Id = typeId, ClubId = _clubId, AssetNameId = nameId, IsActive = true });
            db.AssetBatches.Add(new AssetBatch
            {
                Id = Guid.NewGuid(),
                AssetTypeId = typeId,
                PurchaseDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-30)),
                PurchasePrice = 10m,
                UsefulLifeYears = 3,
                TotalQuantity = 5,
            });

            // Team + checked_out loan for loan-usage tests
            _teamId = Guid.NewGuid();
            db.Teams.Add(new Team
            {
                Id = _teamId, ClubId = _clubId,
                Name = "Reports Team", Gender = "Boys", AgeGroup = "U12",
            });
            db.Loans.Add(new Loan
            {
                Id = Guid.NewGuid(),
                ClubId = _clubId,
                CoachId = _coachUserId,
                TeamId = _teamId,
                Status = LoanStatus.CheckedOut,
                DueDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(7)),
                CreatedBy = _coachUserId,
            });
            await db.SaveChangesAsync();
        });
    }

    public Task DisposeAsync() => Task.CompletedTask;
    public void Dispose() { }

    private HttpClient AuthedClient(Guid userId, ClubRole? role = null)
    {
        var effectiveRole = role ?? (userId == _managerUserId ? ClubRole.AssetManager : ClubRole.Coach);
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", AuthHelper.MintToken(userId, _clubId, effectiveRole));
        return client;
    }

    // ── /summary ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task Summary_Should_Return_Aggregates_For_Manager()
    {
        using var client = AuthedClient(_managerUserId);
        var res = await client.GetAsync("/api/v1/reports/summary");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.TryGetProperty("total_assets", out _).Should().BeTrue();
        body.TryGetProperty("total_items", out _).Should().BeTrue();
        body.TryGetProperty("available_items", out _).Should().BeTrue();
        body.TryGetProperty("total_purchase_value", out _).Should().BeTrue();
    }

    [Fact]
    public async Task Summary_Should_Return_403_For_Coach()
    {
        using var client = AuthedClient(_coachUserId);
        var res = await client.GetAsync("/api/v1/reports/summary");
        res.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Summary_Should_Include_StatusBreakdown_And_CategoryBreakdown()
    {
        using var client = AuthedClient(_managerUserId);
        var res = await client.GetAsync("/api/v1/reports/summary");
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("active_total").GetInt64().Should().BeGreaterThanOrEqualTo(0);
        body.GetProperty("active_total").GetInt64()
            .Should().BeGreaterThanOrEqualTo(body.GetProperty("available_qty").GetInt64());
        body.GetProperty("category_breakdown").ValueKind.Should().Be(JsonValueKind.Array);
    }

    // ── /depreciation ────────────────────────────────────────────────────────

    [Fact]
    public async Task Depreciation_Should_Return_Items_And_Summary()
    {
        using var client = AuthedClient(_managerUserId);
        var res = await client.GetAsync("/api/v1/reports/depreciation");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("items").ValueKind.Should().Be(JsonValueKind.Array);
        body.GetProperty("summary").TryGetProperty("total_batches_with_depreciation", out _)
            .Should().BeTrue();
    }

    // ── /loan-usage ──────────────────────────────────────────────────────────

    [Fact]
    public async Task LoanUsage_Should_Return_TopAssets_And_TeamSummary_GlobalDefault()
    {
        using var client = AuthedClient(_managerUserId);
        var res = await client.GetAsync("/api/v1/reports/loan-usage");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("top_assets").ValueKind.Should().Be(JsonValueKind.Array);
        body.GetProperty("monthly_trend").ValueKind.Should().Be(JsonValueKind.Array);
        var ts = body.GetProperty("team_summary");
        ts.GetProperty("id").ValueKind.Should().Be(JsonValueKind.Null);
        ts.GetProperty("name").GetString().Should().Be("All Teams");
    }

    [Fact]
    public async Task LoanUsage_Should_Return_TeamSummary_When_TeamId_Provided()
    {
        using var client = AuthedClient(_managerUserId);
        var res = await client.GetAsync($"/api/v1/reports/loan-usage?team_id={_teamId}");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        var ts = body.GetProperty("team_summary");
        ts.GetProperty("id").GetGuid().Should().Be(_teamId);
        ts.GetProperty("name").GetString().Should().Be("Reports Team");
        ts.GetProperty("total_loans").GetInt64().Should().BeGreaterThanOrEqualTo(1);
        ts.GetProperty("active_loans").GetInt64().Should().BeGreaterThanOrEqualTo(1);
    }

    // ── /movements + /movements/recent ───────────────────────────────────────

    [Fact]
    public async Task Movements_Should_Return_Type_Counts_Array()
    {
        using var client = AuthedClient(_managerUserId);
        var res = await client.GetAsync("/api/v1/reports/movements");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.ValueKind.Should().Be(JsonValueKind.Array);
    }

    [Fact]
    public async Task RecentMovements_Should_Return_Up_To_10_Entries()
    {
        // Seed at least one stock_movement so the result is non-empty.
        await _factory.WithDbContextAsync(async db =>
        {
            var batch = db.AssetBatches.IgnoreQueryFilters().First();
            db.StockMovements.Add(new StockMovement
            {
                Id = Guid.NewGuid(),
                ClubId = _clubId,
                AssetBatchId = batch.Id,
                Type = StockMovementType.Purchase,
                QuantityDelta = 5,
                QuantityBefore = 0,
                QuantityAfter = 5,
            });
            await db.SaveChangesAsync();
        });

        using var client = AuthedClient(_managerUserId);
        var res = await client.GetAsync("/api/v1/reports/movements/recent");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetArrayLength().Should().BeGreaterThan(0);
        body.GetArrayLength().Should().BeLessThanOrEqualTo(10);
        var first = body[0];
        first.GetProperty("id").ValueKind.Should().Be(JsonValueKind.String);
        first.GetProperty("asset_type_name").ValueKind.Should().Be(JsonValueKind.String);
    }

    [Fact]
    public async Task RecentMovements_Should_Return_403_For_Coach()
    {
        using var client = AuthedClient(_coachUserId);
        var res = await client.GetAsync("/api/v1/reports/movements/recent");
        res.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ── /alerts ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task Alerts_Should_Return_RetirementRisk_And_LowStock_Arrays()
    {
        // Seed a retirement-risk batch (purchased 6 years ago, 5-year life)
        // and a low-stock asset_type.
        Guid retirementBatchId = Guid.NewGuid();
        Guid lowStockTypeId = Guid.NewGuid();
        await _factory.WithDbContextAsync(async db =>
        {
            var retireNameId = Guid.NewGuid();
            db.AssetNames.Add(new AssetName { Id = retireNameId, ClubId = _clubId, Name = "Alert Retire Ball" });
            var retireTypeId = Guid.NewGuid();
            db.AssetTypes.Add(new AssetType
            {
                Id = retireTypeId, ClubId = _clubId, AssetNameId = retireNameId, IsActive = true,
            });
            db.AssetBatches.Add(new AssetBatch
            {
                Id = retirementBatchId,
                AssetTypeId = retireTypeId,
                TotalQuantity = 5,
                PurchaseDate = new DateOnly(2019, 1, 1),
                PurchasePrice = 100m,
                UsefulLifeYears = 5,
            });

            var stockNameId = Guid.NewGuid();
            db.AssetNames.Add(new AssetName { Id = stockNameId, ClubId = _clubId, Name = "Alert Stock Ball" });
            db.AssetTypes.Add(new AssetType
            {
                Id = lowStockTypeId, ClubId = _clubId, AssetNameId = stockNameId, IsActive = true,
            });
            db.AssetBatches.Add(new AssetBatch
            {
                Id = Guid.NewGuid(),
                AssetTypeId = lowStockTypeId,
                TotalQuantity = 10,
                PurchaseDate = new DateOnly(2024, 1, 1),
                PurchasePrice = 20m,
                UsefulLifeYears = 3,
            });
            await db.SaveChangesAsync();
        });

        using var client = AuthedClient(_managerUserId);
        var res = await client.GetAsync("/api/v1/reports/alerts");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("retirement_risk").ValueKind.Should().Be(JsonValueKind.Array);
        body.GetProperty("low_stock").ValueKind.Should().Be(JsonValueKind.Array);
        body.GetProperty("total_alert_count").GetInt32()
            .Should().Be(body.GetProperty("retirement_risk").GetArrayLength()
                       + body.GetProperty("low_stock").GetArrayLength());

        var retire = body.GetProperty("retirement_risk").EnumerateArray()
            .FirstOrDefault(r => r.GetProperty("batch_id").GetGuid() == retirementBatchId);
        retire.ValueKind.Should().NotBe(JsonValueKind.Undefined);
        retire.GetProperty("life_used_percent").GetInt32().Should().BeGreaterThanOrEqualTo(80);

        var lowStock = body.GetProperty("low_stock").EnumerateArray()
            .FirstOrDefault(r => r.GetProperty("asset_type_id").GetGuid() == lowStockTypeId);
        lowStock.ValueKind.Should().NotBe(JsonValueKind.Undefined);
        lowStock.GetProperty("available_qty").GetInt64()
            .Should().BeLessThanOrEqualTo(lowStock.GetProperty("effective_threshold").GetInt32());
    }

    [Fact]
    public async Task Alerts_Should_Return_403_For_Coach()
    {
        using var client = AuthedClient(_coachUserId);
        var res = await client.GetAsync("/api/v1/reports/alerts");
        res.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
