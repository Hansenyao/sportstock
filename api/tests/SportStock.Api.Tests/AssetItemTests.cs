using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using SportStock.Api.Data.Entities;
using SportStock.Api.Data.Enums;
using SportStock.Api.Tests.Helpers;

namespace SportStock.Api.Tests;

[Collection("Database")]
public sealed class AssetItemTests : IAsyncLifetime, IDisposable
{
    private const string Prefix = "t_aitems_";
    private const string ClubPrefix = "AssetItem Test ";

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

    public AssetItemTests(DbFixture dbFixture)
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

                // Seed a warehouse for item operations.
                var wh = new Warehouse
                {
                    Id       = Guid.NewGuid(),
                    ClubId   = cid,
                    Name     = "Main Storage",
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

    // Creates an asset_name + asset_type via DB seeding and returns the type id.
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

    // ── POST /assets/{typeId}/items ──────────────────────────────────────────

    [Fact]
    public async Task AddItem_Should_Return201_When_ValidRequest()
    {
        var typeId = await SeedAssetTypeAsync("Item_AddValid");
        using var client = AuthedClient(_managerUserId, ClubRole.AssetManager);

        var resp = await client.PostAsJsonAsync($"/api/v1/assets/{typeId}/items", new
        {
            warehouse_id  = _warehouseId,
            serial_number = "SN-001",
            notes         = "New item",
        }, JsonOpts);

        resp.StatusCode.Should().Be(HttpStatusCode.Created, await resp.Content.ReadAsStringAsync());
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("asset_type_id").GetGuid().Should().Be(typeId);
        body.GetProperty("warehouse_id").GetGuid().Should().Be(_warehouseId);
        body.GetProperty("serial_number").GetString().Should().Be("SN-001");
        body.GetProperty("status").GetString().Should().Be("available");
    }

    [Fact]
    public async Task AddItem_Should_Return404_When_WarehouseNotFound()
    {
        var typeId = await SeedAssetTypeAsync("Item_WH404");
        using var client = AuthedClient(_managerUserId, ClubRole.AssetManager);

        var resp = await client.PostAsJsonAsync($"/api/v1/assets/{typeId}/items", new
        {
            warehouse_id = Guid.NewGuid(),
        }, JsonOpts);

        resp.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task AddItem_Should_Return403_When_Coach()
    {
        var typeId = await SeedAssetTypeAsync("Item_Coach403");
        using var client = AuthedClient(_coachUserId, ClubRole.Coach);

        var resp = await client.PostAsJsonAsync($"/api/v1/assets/{typeId}/items", new
        {
            warehouse_id = _warehouseId,
        }, JsonOpts);

        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ── GET /assets/{typeId}/items ───────────────────────────────────────────

    [Fact]
    public async Task ListItems_Should_ExcludeRetiredAndWrittenOff()
    {
        var typeId = await SeedAssetTypeAsync("Item_ListFilter");

        // Seed three items: available, retired, written_off.
        await _factory.WithDbContextAsync(async db =>
        {
            await TestData.CreateAssetItemAsync(db, _clubId, typeId, _warehouseId, AssetItemStatus.Available,  "SN-A");
            await TestData.CreateAssetItemAsync(db, _clubId, typeId, _warehouseId, AssetItemStatus.Retired,    "SN-R");
            await TestData.CreateAssetItemAsync(db, _clubId, typeId, _warehouseId, AssetItemStatus.WrittenOff, "SN-W");
        });

        using var client = AuthedClient(_coachUserId, ClubRole.Coach);
        var resp = await client.GetAsync($"/api/v1/assets/{typeId}/items");

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        var items = body.EnumerateArray().ToList();

        items.Should().HaveCount(1);
        items[0].GetProperty("serial_number").GetString().Should().Be("SN-A");
        items[0].GetProperty("status").GetString().Should().Be("available");
    }

    // ── POST /assets/items/{itemId}/retire ───────────────────────────────────

    [Fact]
    public async Task RetireItem_Should_SetStatusRetired()
    {
        var typeId = await SeedAssetTypeAsync("Item_Retire");
        var itemId = await _factory.WithDbContextAsync(db =>
            TestData.CreateAssetItemAsync(db, _clubId, typeId, _warehouseId));

        using var client = AuthedClient(_managerUserId, ClubRole.AssetManager);
        var resp = await client.PostAsync($"/api/v1/assets/items/{itemId}/retire", null);

        resp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Confirm the item is excluded from list (status = retired).
        using var listClient = AuthedClient(_managerUserId, ClubRole.AssetManager);
        var listResp = await listClient.GetAsync($"/api/v1/assets/{typeId}/items");
        var listBody = await listResp.Content.ReadFromJsonAsync<JsonElement>();
        listBody.EnumerateArray().Should().BeEmpty();
    }

    // ── POST /assets/{typeId}/items/retire ───────────────────────────────────

    [Fact]
    public async Task RetireByQuantity_Should_RetireOldestItemsFirst()
    {
        var typeId = await SeedAssetTypeAsync("Item_RetireQty");

        // Seed three items in order (created_at ascending order).
        await _factory.WithDbContextAsync(async db =>
        {
            await TestData.CreateAssetItemAsync(db, _clubId, typeId, _warehouseId, serialNumber: "FIFO-1");
            await TestData.CreateAssetItemAsync(db, _clubId, typeId, _warehouseId, serialNumber: "FIFO-2");
            await TestData.CreateAssetItemAsync(db, _clubId, typeId, _warehouseId, serialNumber: "FIFO-3");
        });

        using var client = AuthedClient(_managerUserId, ClubRole.AssetManager);
        // Retire 2 — should retire FIFO-1 and FIFO-2 (oldest first).
        var resp = await client.PostAsJsonAsync($"/api/v1/assets/{typeId}/items/retire",
            new { quantity = 2, notes = "End of season" }, JsonOpts);

        resp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Only FIFO-3 should remain visible.
        using var listClient = AuthedClient(_managerUserId, ClubRole.AssetManager);
        var listResp  = await listClient.GetAsync($"/api/v1/assets/{typeId}/items");
        var listBody  = await listResp.Content.ReadFromJsonAsync<JsonElement>();
        var remaining = listBody.EnumerateArray().ToList();

        remaining.Should().HaveCount(1);
        remaining[0].GetProperty("serial_number").GetString().Should().Be("FIFO-3");
    }

    [Fact]
    public async Task RetireByQuantity_Should_Return409_When_NotEnoughItems()
    {
        var typeId = await SeedAssetTypeAsync("Item_RetireQty409");
        await _factory.WithDbContextAsync(db =>
            TestData.CreateAssetItemAsync(db, _clubId, typeId, _warehouseId));

        using var client = AuthedClient(_managerUserId, ClubRole.AssetManager);
        var resp = await client.PostAsJsonAsync($"/api/v1/assets/{typeId}/items/retire",
            new { quantity = 5 }, JsonOpts);

        resp.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    // ── POST /assets/{typeId}/items/write-off ────────────────────────────────

    [Fact]
    public async Task WriteOffByQuantity_Should_WriteOffNItems()
    {
        var typeId = await SeedAssetTypeAsync("Item_WriteOff");
        await _factory.WithDbContextAsync(async db =>
        {
            await TestData.CreateAssetItemAsync(db, _clubId, typeId, _warehouseId, serialNumber: "WO-1");
            await TestData.CreateAssetItemAsync(db, _clubId, typeId, _warehouseId, serialNumber: "WO-2");
            await TestData.CreateAssetItemAsync(db, _clubId, typeId, _warehouseId, serialNumber: "WO-3");
        });

        using var client = AuthedClient(_managerUserId, ClubRole.AssetManager);
        var resp = await client.PostAsJsonAsync($"/api/v1/assets/{typeId}/items/write-off",
            new { quantity = 2, reason = "Damaged beyond repair" }, JsonOpts);

        resp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // WO-3 should remain.
        using var listClient = AuthedClient(_managerUserId, ClubRole.AssetManager);
        var listBody = await (await listClient.GetAsync($"/api/v1/assets/{typeId}/items"))
            .Content.ReadFromJsonAsync<JsonElement>();
        var remaining = listBody.EnumerateArray().ToList();

        remaining.Should().HaveCount(1);
        remaining[0].GetProperty("serial_number").GetString().Should().Be("WO-3");
    }
}
