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

// Ports backend/tests/admin.test.ts. Adds a super_admin user (club_id = null)
// to the standard test fixture.
[Collection("Database")]
public sealed class AdminTests : IAsyncLifetime, IDisposable
{
    private const string Prefix = "t_adm_";
    private const string ClubPrefix = "AdminTest Club ";
    private const string SuperAdminEmail = Prefix + "sa@test.com";
    private const string ClubAdminEmail = Prefix + "cadmin@test.com";
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
    private Guid _superAdminId;
    private Guid _clubAdminUserId;
    private Guid _coachUserId;
    private Guid _assetTypeId;

    public AdminTests(DbFixture dbFixture)
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
            _superAdminId = await TestData.CreateUserAsync(db, SuperAdminEmail, null, UserRole.SuperAdmin);
            _clubId = await TestData.CreateClubAsync(db, ClubPrefix + "Main");
            _clubAdminUserId = await TestData.CreateUserAsync(db, ClubAdminEmail, _clubId, UserRole.ClubAdmin);
            _coachUserId = await TestData.CreateUserAsync(db, CoachEmail, _clubId, UserRole.Coach);

            var nameId = Guid.NewGuid();
            db.AssetNames.Add(new AssetName { Id = nameId, ClubId = _clubId, Name = "AdminTest Ball" });
            _assetTypeId = Guid.NewGuid();
            db.AssetTypes.Add(new AssetType
            {
                Id = _assetTypeId, ClubId = _clubId, AssetNameId = nameId, IsActive = true,
            });
            db.AssetBatches.Add(new AssetBatch
            {
                Id = Guid.NewGuid(),
                AssetTypeId = _assetTypeId,
                TotalQuantity = 5, AvailableQuantity = 5,
                Status = AssetStatus.Available,
                PurchasePrice = 10m,
            });
            await db.SaveChangesAsync();
        });
    }

    public Task DisposeAsync() => Task.CompletedTask;
    public void Dispose() { }

    private HttpClient AuthedClient(Guid userId)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", AuthHelper.MintToken(userId));
        return client;
    }

    // ── Auth guard ───────────────────────────────────────────────────────────

    [Fact]
    public async Task Stats_Should_Return_401_Without_Token()
    {
        using var client = _factory.CreateClient();
        var res = await client.GetAsync("/api/v1/admin/stats");
        res.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Stats_Should_Return_403_For_ClubAdmin()
    {
        using var client = AuthedClient(_clubAdminUserId);
        var res = await client.GetAsync("/api/v1/admin/stats");
        res.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Stats_Should_Return_PlatformStats_For_SuperAdmin()
    {
        using var client = AuthedClient(_superAdminId);
        var res = await client.GetAsync("/api/v1/admin/stats");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("total_clubs").GetInt64().Should().BeGreaterThanOrEqualTo(1);
        body.TryGetProperty("active_loans", out _).Should().BeTrue();
        body.TryGetProperty("overdue_loans", out _).Should().BeTrue();
    }

    // ── Analytics ────────────────────────────────────────────────────────────

    [Fact]
    public async Task Analytics_Overview_Should_Return_Platform_Shape_When_No_ClubId()
    {
        using var client = AuthedClient(_superAdminId);
        var res = await client.GetAsync("/api/v1/admin/analytics/overview");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.TryGetProperty("total_clubs", out _).Should().BeTrue();
        body.TryGetProperty("asset_by_status", out _).Should().BeTrue();
        body.TryGetProperty("total_asset_value", out _).Should().BeTrue();
    }

    [Fact]
    public async Task Analytics_Overview_Should_Return_Club_Shape_When_ClubId_Set()
    {
        using var client = AuthedClient(_superAdminId);
        var res = await client.GetAsync($"/api/v1/admin/analytics/overview?club_id={_clubId}");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.TryGetProperty("user_count", out _).Should().BeTrue();
        body.TryGetProperty("asset_count", out _).Should().BeTrue();
        body.TryGetProperty("total_clubs", out _).Should().BeFalse();
    }

    [Fact]
    public async Task Analytics_Loans_Should_Return_Trend_And_TopAssets()
    {
        using var client = AuthedClient(_superAdminId);
        var res = await client.GetAsync("/api/v1/admin/analytics/loans");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("monthly_trend").ValueKind.Should().Be(JsonValueKind.Array);
        body.GetProperty("top_assets").ValueKind.Should().Be(JsonValueKind.Array);
    }

    [Fact]
    public async Task Analytics_Assets_Should_Return_ByStatus_And_ByCategory()
    {
        using var client = AuthedClient(_superAdminId);
        var res = await client.GetAsync("/api/v1/admin/analytics/assets");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("by_status").ValueKind.Should().Be(JsonValueKind.Array);
        body.GetProperty("by_category").ValueKind.Should().Be(JsonValueKind.Array);
    }

    [Fact]
    public async Task Analytics_Growth_Should_Return_Clubs_And_Users_Arrays()
    {
        using var client = AuthedClient(_superAdminId);
        var res = await client.GetAsync("/api/v1/admin/analytics/growth");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("clubs").ValueKind.Should().Be(JsonValueKind.Array);
        body.GetProperty("users").ValueKind.Should().Be(JsonValueKind.Array);
    }

    // ── Clubs ────────────────────────────────────────────────────────────────

    [Fact]
    public async Task ListClubs_Should_Return_Paginated_With_Stats()
    {
        using var client = AuthedClient(_superAdminId);
        var res = await client.GetAsync("/api/v1/admin/clubs");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("total").GetInt64().Should().BeGreaterThanOrEqualTo(1);
        var club = body.GetProperty("data").EnumerateArray()
            .FirstOrDefault(c => c.GetProperty("id").GetGuid() == _clubId);
        club.ValueKind.Should().NotBe(JsonValueKind.Undefined);
        club.TryGetProperty("user_count", out _).Should().BeTrue();
        club.TryGetProperty("asset_count", out _).Should().BeTrue();
    }

    [Fact]
    public async Task ListClubs_Should_Filter_By_Search()
    {
        using var client = AuthedClient(_superAdminId);
        var res = await client.GetAsync("/api/v1/admin/clubs?search=AdminTest");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("data").GetArrayLength().Should().BeGreaterThanOrEqualTo(1);
    }

    [Fact]
    public async Task GetClub_Should_Return_Detail_With_Admin_Account_And_Stats()
    {
        using var client = AuthedClient(_superAdminId);
        var res = await client.GetAsync($"/api/v1/admin/clubs/{_clubId}");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("id").GetGuid().Should().Be(_clubId);
        var admin = body.GetProperty("admin_account");
        admin.GetProperty("id").GetGuid().Should().Be(_clubAdminUserId);
        admin.GetProperty("email").GetString().Should().Be(ClubAdminEmail);
        body.GetProperty("stats").TryGetProperty("user_count", out _).Should().BeTrue();
    }

    [Fact]
    public async Task GetClub_Should_Return_404_For_Unknown_Id()
    {
        using var client = AuthedClient(_superAdminId);
        var res = await client.GetAsync($"/api/v1/admin/clubs/{Guid.NewGuid()}");
        res.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task UpdateClubStatus_Should_Disable_And_ReEnable()
    {
        using var client = AuthedClient(_superAdminId);
        var disable = await client.PatchAsJsonAsync($"/api/v1/admin/clubs/{_clubId}/status",
            new { is_active = false }, JsonOpts);
        disable.StatusCode.Should().Be(HttpStatusCode.OK);

        var disabled = await _factory.WithDbContextAsync(async db =>
            await db.Clubs.IgnoreQueryFilters().Where(c => c.Id == _clubId).Select(c => c.IsActive).FirstAsync());
        disabled.Should().BeFalse();

        var enable = await client.PatchAsJsonAsync($"/api/v1/admin/clubs/{_clubId}/status",
            new { is_active = true }, JsonOpts);
        enable.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task ResetClubAdminPassword_Should_Return_TempPassword_That_Works()
    {
        using var client = AuthedClient(_superAdminId);
        // Mark admin email_verified so login flow accepts the temp password.
        await _factory.WithDbContextAsync(async db =>
        {
            await db.Users.IgnoreQueryFilters()
                .Where(u => u.Id == _clubAdminUserId)
                .ExecuteUpdateAsync(s => s.SetProperty(u => u.EmailVerified, true));
        });

        var res = await client.PostAsync($"/api/v1/admin/clubs/{_clubId}/reset-admin-password", null);
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        var temp = body.GetProperty("temp_password").GetString();
        temp.Should().NotBeNullOrEmpty();
        temp!.Length.Should().BeGreaterThanOrEqualTo(12);

        var login = await _factory.CreateClient().PostAsJsonAsync("/api/v1/auth/login",
            new { email = ClubAdminEmail, password = temp }, JsonOpts);
        login.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    // ── Users ────────────────────────────────────────────────────────────────

    [Fact]
    public async Task ListClubUsers_Should_Include_Club_Members()
    {
        using var client = AuthedClient(_superAdminId);
        var res = await client.GetAsync($"/api/v1/admin/clubs/{_clubId}/users");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("total").GetInt64().Should().BeGreaterThanOrEqualTo(2);
        var emails = body.GetProperty("data").EnumerateArray()
            .Select(u => u.GetProperty("email").GetString()).ToList();
        emails.Should().Contain(ClubAdminEmail);
        emails.Should().Contain(CoachEmail);
    }

    [Fact]
    public async Task UpdateUserStatus_Should_Toggle_IsActive()
    {
        using var client = AuthedClient(_superAdminId);
        var disable = await client.PatchAsJsonAsync(
            $"/api/v1/admin/clubs/{_clubId}/users/{_coachUserId}/status",
            new { is_active = false }, JsonOpts);
        disable.StatusCode.Should().Be(HttpStatusCode.OK);
        var enable = await client.PatchAsJsonAsync(
            $"/api/v1/admin/clubs/{_clubId}/users/{_coachUserId}/status",
            new { is_active = true }, JsonOpts);
        enable.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task ResetUserPassword_Should_Issue_Working_TempPassword()
    {
        // Coach needs email_verified for the login flow to accept the temp password.
        await _factory.WithDbContextAsync(async db =>
        {
            await db.Users.IgnoreQueryFilters()
                .Where(u => u.Id == _coachUserId)
                .ExecuteUpdateAsync(s => s.SetProperty(u => u.EmailVerified, true));
        });

        using var client = AuthedClient(_superAdminId);
        var res = await client.PostAsync(
            $"/api/v1/admin/clubs/{_clubId}/users/{_coachUserId}/reset-password", null);
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        var temp = body.GetProperty("temp_password").GetString();
        temp.Should().NotBeNullOrEmpty();

        var login = await _factory.CreateClient().PostAsJsonAsync("/api/v1/auth/login",
            new { email = CoachEmail, password = temp }, JsonOpts);
        login.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    // ── Assets ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task ListClubAssets_Should_Return_Seeded_Asset()
    {
        using var client = AuthedClient(_superAdminId);
        var res = await client.GetAsync($"/api/v1/admin/clubs/{_clubId}/assets");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("total").GetInt64().Should().BeGreaterThanOrEqualTo(1);
        var found = body.GetProperty("data").EnumerateArray()
            .Any(a => a.GetProperty("id").GetGuid() == _assetTypeId);
        found.Should().BeTrue();
    }

    [Fact]
    public async Task UpdateAssetStatus_Should_Toggle_IsActive_And_Reject_NonBoolean()
    {
        using var client = AuthedClient(_superAdminId);
        var disable = await client.PatchAsJsonAsync(
            $"/api/v1/admin/clubs/{_clubId}/assets/{_assetTypeId}/status",
            new { is_active = false }, JsonOpts);
        disable.StatusCode.Should().Be(HttpStatusCode.OK);

        var current = await _factory.WithDbContextAsync(async db =>
            await db.AssetTypes.IgnoreQueryFilters()
                .Where(a => a.Id == _assetTypeId).Select(a => a.IsActive).FirstAsync());
        current.Should().BeFalse();

        var bad = await client.PatchAsJsonAsync(
            $"/api/v1/admin/clubs/{_clubId}/assets/{_assetTypeId}/status",
            new { is_active = "yes" }, JsonOpts);
        bad.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task DeleteAsset_Should_HardDelete_AssetType()
    {
        // Seed a throwaway type to delete.
        var extraTypeId = Guid.NewGuid();
        await _factory.WithDbContextAsync(async db =>
        {
            var nameId = Guid.NewGuid();
            db.AssetNames.Add(new AssetName { Id = nameId, ClubId = _clubId, Name = "AdminTest DeleteMe" });
            db.AssetTypes.Add(new AssetType
            {
                Id = extraTypeId, ClubId = _clubId, AssetNameId = nameId, IsActive = true,
            });
            await db.SaveChangesAsync();
        });

        using var client = AuthedClient(_superAdminId);
        var res = await client.DeleteAsync($"/api/v1/admin/clubs/{_clubId}/assets/{extraTypeId}");
        res.StatusCode.Should().Be(HttpStatusCode.OK);

        var exists = await _factory.WithDbContextAsync(async db =>
            await db.AssetTypes.IgnoreQueryFilters().AnyAsync(a => a.Id == extraTypeId));
        exists.Should().BeFalse();
    }

    [Fact]
    public async Task ListClubLoans_Should_Return_Paginated_Result()
    {
        using var client = AuthedClient(_superAdminId);
        var res = await client.GetAsync($"/api/v1/admin/clubs/{_clubId}/loans");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.TryGetProperty("data", out _).Should().BeTrue();
        body.GetProperty("total").GetInt64().Should().BeGreaterThanOrEqualTo(0);
    }
}
