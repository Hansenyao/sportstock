using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using SportStock.Api.Data.Enums;
using SportStock.Api.Tests.Helpers;

namespace SportStock.Api.Tests;

// 1:1 port of backend/tests/clubs.test.ts. The Node test file also embeds a
// duplicate of the "register creates club + admin" assertion already covered
// by AuthTests — skipped here to avoid maintenance drift.
[Collection("Database")]
public sealed class ClubsTests : IAsyncLifetime, IDisposable
{
    private const string Prefix = "t_clubs_";
    private const string ClubPrefix = "Clubs Test ";
    private const string AdminEmail = Prefix + "admin@test.com";
    private const string ManagerEmail = Prefix + "manager@test.com";

    private readonly DbFixture _dbFixture;
    private readonly SportStockWebApplicationFactory _factory;
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
    };

    private static SportStockWebApplicationFactory? s_factory;
    private static readonly object s_factoryLock = new();

    private Guid _clubId;
    private Guid _adminUserId;
    private Guid _managerUserId;

    public ClubsTests(DbFixture dbFixture)
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
            await TestData.CreateWarehouseAsync(db, _clubId);
            _adminUserId = await TestData.CreateUserAsync(db, AdminEmail);
            await TestData.CreateMembershipAsync(db, _clubId, _adminUserId, ClubRole.ClubAdmin);
            _managerUserId = await TestData.CreateUserAsync(db, ManagerEmail);
            await TestData.CreateMembershipAsync(db, _clubId, _managerUserId, ClubRole.AssetManager);
        });
    }

    public Task DisposeAsync() => Task.CompletedTask;

    public void Dispose() { /* shared static factory */ }

    private HttpClient AuthedClient(Guid userId, ClubRole role = ClubRole.ClubAdmin)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", AuthHelper.MintToken(userId, _clubId, role));
        return client;
    }

    // ── GET /api/v1/clubs/me ─────────────────────────────────────────────────

    [Fact]
    public async Task GetMine_Should_Return_Club_Profile_For_Admin()
    {
        using var client = AuthedClient(_adminUserId);
        var response = await client.GetAsync("/api/v1/clubs/me");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("id").GetGuid().Should().Be(_clubId);
        body.GetProperty("name").GetString().Should().Be(ClubPrefix + "Club");
    }

    [Fact]
    public async Task GetMine_Should_Return_Club_Profile_For_Manager()
    {
        using var client = AuthedClient(_managerUserId, ClubRole.AssetManager);
        var response = await client.GetAsync("/api/v1/clubs/me");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("id").GetGuid().Should().Be(_clubId);
    }

    // ── PUT /api/v1/clubs/me ─────────────────────────────────────────────────

    [Fact]
    public async Task UpdateMine_Should_Update_When_Admin()
    {
        using var client = AuthedClient(_adminUserId);
        var response = await client.PutAsJsonAsync("/api/v1/clubs/me", new
        {
            sport_type = "Football",
            low_stock_threshold = 3,
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("sport_type").GetString().Should().Be("Football");
        body.GetProperty("low_stock_threshold").GetInt32().Should().Be(3);
    }

    [Fact]
    public async Task UpdateMine_Should_Return_403_For_Non_Admin()
    {
        using var client = AuthedClient(_managerUserId, ClubRole.AssetManager);
        var response = await client.PutAsJsonAsync("/api/v1/clubs/me", new
        {
            sport_type = "Basketball",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ── Retirement alert settings ────────────────────────────────────────────

    [Fact]
    public async Task UpdateMine_Should_Persist_Retirement_Alert_Fields()
    {
        using var client = AuthedClient(_adminUserId);
        var put = await client.PutAsJsonAsync("/api/v1/clubs/me", new
        {
            retirement_alert_mode = "months",
            retirement_alert_value = 6,
        }, JsonOpts);

        put.StatusCode.Should().Be(HttpStatusCode.OK);
        var putBody = await put.Content.ReadFromJsonAsync<JsonElement>();
        putBody.GetProperty("retirement_alert_mode").GetString().Should().Be("months");
        putBody.GetProperty("retirement_alert_value").GetInt32().Should().Be(6);

        // Read-back must return what we just wrote.
        var get = await client.GetAsync("/api/v1/clubs/me");
        get.StatusCode.Should().Be(HttpStatusCode.OK);
        var getBody = await get.Content.ReadFromJsonAsync<JsonElement>();
        getBody.GetProperty("retirement_alert_mode").GetString().Should().Be("months");
        getBody.GetProperty("retirement_alert_value").GetInt32().Should().Be(6);
    }

    [Fact]
    public async Task UpdateMine_Should_Return_422_When_Mode_Invalid()
    {
        using var client = AuthedClient(_adminUserId);
        var response = await client.PutAsJsonAsync("/api/v1/clubs/me", new
        {
            retirement_alert_mode = "invalid",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
    }

    [Fact]
    public async Task UpdateMine_Should_Return_422_When_Value_Non_Numeric()
    {
        using var client = AuthedClient(_adminUserId);
        var response = await client.PutAsJsonAsync("/api/v1/clubs/me", new
        {
            retirement_alert_value = "notanumber",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
    }

    [Fact]
    public async Task UpdateMine_Should_Preserve_Existing_Value_When_Only_Mode_Sent()
    {
        using var client = AuthedClient(_adminUserId);

        // First set a known state.
        var seed = await client.PutAsJsonAsync("/api/v1/clubs/me", new
        {
            retirement_alert_mode = "percent",
            retirement_alert_value = 90,
        }, JsonOpts);
        seed.StatusCode.Should().Be(HttpStatusCode.OK);

        // Update only the mode — value must remain 90.
        var update = await client.PutAsJsonAsync("/api/v1/clubs/me", new
        {
            retirement_alert_mode = "months",
        }, JsonOpts);

        update.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await update.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("retirement_alert_mode").GetString().Should().Be("months");
        body.GetProperty("retirement_alert_value").GetInt32().Should().Be(90);
    }
}
