using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using SportStock.Api.Data.Entities;
using SportStock.Api.Data.Enums;
using SportStock.Api.Tests.Helpers;
using Xunit;

namespace SportStock.Api.Tests;

[Collection("Database")]
public sealed class KitTests : IAsyncLifetime, IDisposable
{
    private const string Prefix = "t_kits_";
    private const string ClubPrefix = "Kit Test ";

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
    private Guid _coachUserId;
    private Guid _warehouseId;

    public KitTests(DbFixture dbFixture)
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
        (_adminUserId, _managerUserId, _coachUserId, _clubId, _warehouseId) =
            await _factory.WithDbContextAsync(async db =>
            {
                await TestData.ResetAuthAsync(db, Prefix, ClubPrefix);

                var adminId   = await TestData.CreateUserAsync(db, Prefix + "admin@test.com");
                var managerId = await TestData.CreateUserAsync(db, Prefix + "manager@test.com");
                var coachId   = await TestData.CreateUserAsync(db, Prefix + "coach@test.com");
                var cid       = await TestData.CreateClubAsync(db, adminId, ClubPrefix + "Club");

                await TestData.CreateMembershipAsync(db, cid, adminId,   ClubRole.ClubAdmin);
                await TestData.CreateMembershipAsync(db, cid, managerId, ClubRole.AssetManager);
                await TestData.CreateMembershipAsync(db, cid, coachId,   ClubRole.Coach);

                var wh = new Warehouse
                {
                    Id       = Guid.NewGuid(),
                    ClubId   = cid,
                    Name     = "Kit Test Storage",
                    IsActive = true,
                };
                db.Warehouses.Add(wh);
                await db.SaveChangesAsync();

                return (adminId, managerId, coachId, cid, wh.Id);
            });
    }

    public Task DisposeAsync() => Task.CompletedTask;
    public void Dispose() { }

    private HttpClient AuthedClient(Guid userId, ClubRole role)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", AuthHelper.MintToken(userId, _clubId, role));
        return client;
    }

    // Seeds an AssetName + AssetType and returns the AssetType id.
    private async Task<Guid> SeedAssetTypeAsync(string name)
    {
        return await _factory.WithDbContextAsync(async db =>
        {
            var assetName = new AssetName
            {
                Id     = Guid.NewGuid(),
                ClubId = _clubId,
                Name   = name,
            };
            db.AssetNames.Add(assetName);
            await db.SaveChangesAsync();

            var assetType = new AssetType
            {
                Id          = Guid.NewGuid(),
                ClubId      = _clubId,
                AssetNameId = assetName.Id,
                IsActive    = true,
            };
            db.AssetTypes.Add(assetType);
            await db.SaveChangesAsync();

            return assetType.Id;
        });
    }

    // ── POST /kits ────────────────────────────────────────────────────────────

    [Fact]
    public async Task CreateKit_Should_Return201_When_AssetManager()
    {
        using var client = AuthedClient(_managerUserId, ClubRole.AssetManager);

        var resp = await client.PostAsJsonAsync("/api/v1/kits", new
        {
            name        = $"Training Kit {Guid.NewGuid()}",
            description = "Standard training bundle",
        }, JsonOpts);

        resp.StatusCode.Should().Be(HttpStatusCode.Created, await resp.Content.ReadAsStringAsync());
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("name").GetString().Should().NotBeNullOrEmpty();
        body.GetProperty("is_active").GetBoolean().Should().BeTrue();
    }

    // ── GET /kits/{id} — isAvailable: true ───────────────────────────────────

    [Fact]
    public async Task GetKit_Should_ReturnIsAvailable_True_When_SufficientStock()
    {
        var typeId = await SeedAssetTypeAsync($"Football_{Guid.NewGuid()}");

        // Seed 5 available items — kit will require 3.
        await _factory.WithDbContextAsync(async db =>
        {
            for (var i = 0; i < 5; i++)
                await TestData.CreateAssetItemAsync(db, _clubId, typeId, _warehouseId);
        });

        // Create kit via API.
        using var client = AuthedClient(_managerUserId, ClubRole.AssetManager);
        var createResp = await client.PostAsJsonAsync("/api/v1/kits", new
        {
            name = $"Avail_True_Kit_{Guid.NewGuid()}",
        }, JsonOpts);
        createResp.StatusCode.Should().Be(HttpStatusCode.Created);
        var kitId = (await createResp.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        // Add an item requiring 3 of the type.
        var addResp = await client.PostAsJsonAsync($"/api/v1/kits/{kitId}/items", new
        {
            asset_type_id = typeId,
            quantity      = 3,
        }, JsonOpts);
        addResp.StatusCode.Should().Be(HttpStatusCode.Created, await addResp.Content.ReadAsStringAsync());

        // GET kit detail — availability should be true.
        var getResp = await client.GetAsync($"/api/v1/kits/{kitId}");
        getResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var detail = await getResp.Content.ReadFromJsonAsync<JsonElement>();
        detail.GetProperty("is_available").GetBoolean().Should().BeTrue();
        var items = detail.GetProperty("items").EnumerateArray().ToList();
        items.Should().HaveCount(1);
        items[0].GetProperty("available_quantity").GetInt32().Should().Be(5);
    }

    // ── GET /kits/{id} — isAvailable: false ──────────────────────────────────

    [Fact]
    public async Task GetKit_Should_ReturnIsAvailable_False_When_InsufficientStock()
    {
        var typeId = await SeedAssetTypeAsync($"Cone_{Guid.NewGuid()}");

        // Seed only 1 available item — kit will require 5.
        await _factory.WithDbContextAsync(db =>
            TestData.CreateAssetItemAsync(db, _clubId, typeId, _warehouseId));

        using var client = AuthedClient(_managerUserId, ClubRole.AssetManager);
        var createResp = await client.PostAsJsonAsync("/api/v1/kits", new
        {
            name = $"Avail_False_Kit_{Guid.NewGuid()}",
        }, JsonOpts);
        createResp.StatusCode.Should().Be(HttpStatusCode.Created);
        var kitId = (await createResp.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        // Require 5 cones but only 1 exists.
        var addResp = await client.PostAsJsonAsync($"/api/v1/kits/{kitId}/items", new
        {
            asset_type_id = typeId,
            quantity      = 5,
        }, JsonOpts);
        addResp.StatusCode.Should().Be(HttpStatusCode.Created, await addResp.Content.ReadAsStringAsync());

        var getResp = await client.GetAsync($"/api/v1/kits/{kitId}");
        getResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var detail = await getResp.Content.ReadFromJsonAsync<JsonElement>();
        detail.GetProperty("is_available").GetBoolean().Should().BeFalse();
        var items = detail.GetProperty("items").EnumerateArray().ToList();
        items[0].GetProperty("available_quantity").GetInt32().Should().Be(1);
    }

    // ── DELETE /kits/{id} — soft delete ──────────────────────────────────────

    [Fact]
    public async Task DeleteKit_Should_SoftDelete()
    {
        using var client = AuthedClient(_adminUserId, ClubRole.ClubAdmin);

        var kitName = $"SoftDelete_Kit_{Guid.NewGuid()}";
        var createResp = await client.PostAsJsonAsync("/api/v1/kits", new { name = kitName }, JsonOpts);
        createResp.StatusCode.Should().Be(HttpStatusCode.Created);
        var kitId = (await createResp.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        // DELETE the kit.
        var delResp = await client.DeleteAsync($"/api/v1/kits/{kitId}");
        delResp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // GET should now return 404 (soft-deleted, IsActive = false).
        var getResp = await client.GetAsync($"/api/v1/kits/{kitId}");
        getResp.StatusCode.Should().Be(HttpStatusCode.NotFound);

        // LIST should not contain the deleted kit.
        var listResp = await client.GetAsync("/api/v1/kits");
        listResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var list = await listResp.Content.ReadFromJsonAsync<JsonElement>();
        var names = list.EnumerateArray().Select(e => e.GetProperty("name").GetString()).ToList();
        names.Should().NotContain(kitName);
    }
}
