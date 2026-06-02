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

// Ports backend/tests/inventory.test.ts and augments with SP-driven
// side-effect tests (retire/maintenance batch status + stock_movements).
[Collection("Database")]
public sealed class InventoryTests : IAsyncLifetime, IDisposable
{
    private const string Prefix = "t_inv_";
    private const string ClubPrefix = "Inventory Test ";
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
    private Guid _adminUserId;
    private Guid _managerUserId;
    private Guid _coachUserId;
    private Guid _assetTypeId;
    private Guid _assetBatchId;

    public InventoryTests(DbFixture dbFixture)
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
            _adminUserId = await TestData.CreateUserAsync(db, AdminEmail);
            await TestData.CreateMembershipAsync(db, _clubId, _adminUserId, ClubRole.ClubAdmin);
            _managerUserId = await TestData.CreateUserAsync(db, ManagerEmail);
            await TestData.CreateMembershipAsync(db, _clubId, _managerUserId, ClubRole.AssetManager);
            _coachUserId = await TestData.CreateUserAsync(db, CoachEmail);
            await TestData.CreateMembershipAsync(db, _clubId, _coachUserId, ClubRole.Coach);
        });

        // Seed an asset_type + asset_batch with the initial purchase movement
        // so /movements is non-empty without needing a separate test fixture.
        (_assetTypeId, _assetBatchId) = await CreateAssetWithBatchAsync("Inventory Ball", 10);
    }

    public Task DisposeAsync() => Task.CompletedTask;
    public void Dispose() { }

    private HttpClient AuthedClient(Guid userId, ClubRole? role = null)
    {
        var effectiveRole = role ?? (userId == _adminUserId ? ClubRole.ClubAdmin
                                  : userId == _managerUserId ? ClubRole.AssetManager
                                  : ClubRole.Coach);
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", AuthHelper.MintToken(userId, _clubId, effectiveRole));
        return client;
    }

    private async Task<(Guid typeId, Guid batchId)> CreateAssetWithBatchAsync(string name, int qty)
    {
        // Use the API path so the same flow exercises CreateAsync's transaction
        // (asset_type + asset_batch + stock_movement) — the same path under
        // test in AssetsTests.
        Guid assetNameId = Guid.NewGuid();
        await _factory.WithDbContextAsync(async db =>
        {
            db.AssetNames.Add(new AssetName
            {
                Id = assetNameId,
                ClubId = _clubId,
                Name = name,
            });
            await db.SaveChangesAsync();
        });

        using var client = AuthedClient(_managerUserId);
        var res = await client.PostAsJsonAsync("/api/v1/assets", new
        {
            asset_name_id = assetNameId,
            total_quantity = qty,
            purchase_price = 25.00,
            purchase_date = "2024-01-01",
            useful_life_years = 3,
        }, JsonOpts);
        res.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        var typeId = body.GetProperty("id").GetGuid();
        var batchId = body.GetProperty("batches")[0].GetProperty("id").GetGuid();
        return (typeId, batchId);
    }

    // ── GET /movements ───────────────────────────────────────────────────────

    [Fact]
    public async Task Movements_Should_Return_Paginated_For_Manager()
    {
        using var client = AuthedClient(_managerUserId);
        var response = await client.GetAsync("/api/v1/inventory/movements");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("data").ValueKind.Should().Be(JsonValueKind.Array);
        body.GetProperty("total").GetInt32().Should().BeGreaterThanOrEqualTo(1);
    }

    [Fact]
    public async Task Movements_Should_Return_403_For_Coach()
    {
        using var client = AuthedClient(_coachUserId);
        var response = await client.GetAsync("/api/v1/inventory/movements");
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Movements_Should_Filter_By_AssetTypeId()
    {
        using var client = AuthedClient(_managerUserId);
        var response = await client.GetAsync(
            $"/api/v1/inventory/movements?asset_type_id={_assetTypeId}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("data").GetArrayLength().Should().BeGreaterThanOrEqualTo(1);
        body.GetProperty("data").EnumerateArray()
            .All(m => m.GetProperty("asset_batch_id").GetGuid() == _assetBatchId)
            .Should().BeTrue();
    }

    // ── POST /batches/:id/adjust ─────────────────────────────────────────────

    [Fact]
    public async Task Adjust_Should_Change_Available_Quantity()
    {
        using var client = AuthedClient(_managerUserId);

        var before = await client.GetFromJsonAsync<JsonElement>($"/api/v1/assets/{_assetTypeId}");
        var prevQty = before.GetProperty("available_quantity").GetInt32();

        var res = await client.PostAsJsonAsync(
            $"/api/v1/inventory/batches/{_assetBatchId}/adjust",
            new { quantity_delta = -2, notes = "Lost items" }, JsonOpts);
        res.StatusCode.Should().Be(HttpStatusCode.OK);

        var after = await client.GetFromJsonAsync<JsonElement>($"/api/v1/assets/{_assetTypeId}");
        after.GetProperty("available_quantity").GetInt32().Should().Be(prevQty - 2);
    }

    [Fact]
    public async Task Adjust_Should_Return_409_When_Resulting_Negative()
    {
        using var client = AuthedClient(_managerUserId);
        var res = await client.PostAsJsonAsync(
            $"/api/v1/inventory/batches/{_assetBatchId}/adjust",
            new { quantity_delta = -9999 }, JsonOpts);

        res.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("message").GetString()
            .Should().Be("Adjustment would result in negative available quantity");
    }

    [Fact]
    public async Task Adjust_Should_Return_400_When_QuantityDelta_Missing()
    {
        using var client = AuthedClient(_managerUserId);
        var res = await client.PostAsJsonAsync(
            $"/api/v1/inventory/batches/{_assetBatchId}/adjust",
            new { notes = "no delta" }, JsonOpts);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Adjust_Should_Return_404_For_Unknown_Batch()
    {
        using var client = AuthedClient(_managerUserId);
        var res = await client.PostAsJsonAsync(
            $"/api/v1/inventory/batches/{Guid.NewGuid()}/adjust",
            new { quantity_delta = 1 }, JsonOpts);
        res.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Adjust_Should_Emit_StockMovement_Row()
    {
        using var client = AuthedClient(_managerUserId);
        var res = await client.PostAsJsonAsync(
            $"/api/v1/inventory/batches/{_assetBatchId}/adjust",
            new { quantity_delta = 1, notes = "Movement smoke" }, JsonOpts);
        res.StatusCode.Should().Be(HttpStatusCode.OK);

        var adjustments = await _factory.WithDbContextAsync(async db =>
            await db.StockMovements.IgnoreQueryFilters()
                .Where(sm => sm.AssetBatchId == _assetBatchId && sm.Type == StockMovementType.Adjustment)
                .CountAsync());
        adjustments.Should().BeGreaterThanOrEqualTo(1);
    }

    // ── POST /batches/:id/retire ─────────────────────────────────────────────

    [Fact]
    public async Task Retire_Should_Reduce_Total_Quantity_And_Emit_WriteOff_Movement()
    {
        using var client = AuthedClient(_managerUserId);
        var res = await client.PostAsJsonAsync(
            $"/api/v1/inventory/batches/{_assetBatchId}/retire",
            new { quantity = 2, notes = "Wear and tear" }, JsonOpts);

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("total_quantity").GetInt32().Should().Be(8);
        body.GetProperty("status").GetString().Should().Be("available");

        // SP side effect — a write_off-typed stock_movement must exist.
        var writeOffCount = await _factory.WithDbContextAsync(async db =>
            await db.StockMovements.IgnoreQueryFilters()
                .Where(sm => sm.AssetBatchId == _assetBatchId && sm.Type == StockMovementType.WriteOff)
                .CountAsync());
        writeOffCount.Should().BeGreaterThanOrEqualTo(1);
    }

    [Fact]
    public async Task Retire_Should_Flip_Status_To_Retired_When_All_Units_Gone()
    {
        var (_, batchId) = await CreateAssetWithBatchAsync("Retirable Ball", 3);

        using var client = AuthedClient(_managerUserId);
        var res = await client.PostAsJsonAsync(
            $"/api/v1/inventory/batches/{batchId}/retire",
            new { quantity = 3 }, JsonOpts);

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("status").GetString().Should().Be("retired");
        body.GetProperty("total_quantity").GetInt32().Should().Be(0);
    }

    [Fact]
    public async Task Retire_Should_Return_409_When_Quantity_Exceeds_Total()
    {
        using var client = AuthedClient(_managerUserId);
        var res = await client.PostAsJsonAsync(
            $"/api/v1/inventory/batches/{_assetBatchId}/retire",
            new { quantity = 9999 }, JsonOpts);

        res.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("message").GetString()
            .Should().Contain("Cannot retire");
    }

    [Fact]
    public async Task Retire_Should_Return_400_When_Quantity_Missing_Or_Zero()
    {
        using var client = AuthedClient(_managerUserId);
        var res = await client.PostAsJsonAsync(
            $"/api/v1/inventory/batches/{_assetBatchId}/retire",
            new { quantity = 0 }, JsonOpts);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Retire_Should_Return_404_For_Unknown_Batch()
    {
        using var client = AuthedClient(_managerUserId);
        var res = await client.PostAsJsonAsync(
            $"/api/v1/inventory/batches/{Guid.NewGuid()}/retire",
            new { quantity = 1 }, JsonOpts);
        res.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ── POST /batches/:id/maintenance ────────────────────────────────────────

    // TODO: In v2 schema, AssetBatch.Status and AssetBatch.AvailableQuantity are
    // removed — status/quantity are derived from AssetItems. This test seeded the
    // batch directly into maintenance state via those removed fields; the maintenance
    // endpoint itself needs to be redesigned for v2. Skipped until the endpoint is updated.
    // [Fact]
    // public async Task Maintenance_Should_Restore_Available_Qty_And_Flip_Status()

    [Fact]
    public async Task Maintenance_Should_Return_409_When_Batch_Not_In_Maintenance()
    {
        using var client = AuthedClient(_managerUserId);
        var res = await client.PostAsJsonAsync(
            $"/api/v1/inventory/batches/{_assetBatchId}/maintenance",
            new { quantity_restored = 1 }, JsonOpts);

        res.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("message").GetString()
            .Should().Contain("not in maintenance status");
    }

    [Fact]
    public async Task Maintenance_Should_Return_400_When_QuantityRestored_Missing()
    {
        using var client = AuthedClient(_managerUserId);
        var res = await client.PostAsJsonAsync(
            $"/api/v1/inventory/batches/{_assetBatchId}/maintenance",
            new { notes = "no qty" }, JsonOpts);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    // ── Stocktake CRUD ───────────────────────────────────────────────────────

    [Fact]
    public async Task Stocktake_Should_Create_In_Progress_Session()
    {
        using var client = AuthedClient(_managerUserId);
        var res = await client.PostAsJsonAsync("/api/v1/inventory/stocktake",
            new { notes = "Monthly count" }, JsonOpts);

        res.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("status").GetString().Should().Be("in_progress");
        body.GetProperty("conducted_by_name").GetString().Should().NotBeNullOrEmpty();
    }

    [Fact]
    public async Task Stocktake_Should_List_Sessions()
    {
        using var client = AuthedClient(_managerUserId);
        await client.PostAsJsonAsync("/api/v1/inventory/stocktake",
            new { notes = "Listed" }, JsonOpts);

        var res = await client.GetAsync("/api/v1/inventory/stocktake");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetArrayLength().Should().BeGreaterThanOrEqualTo(1);
    }

    [Fact]
    public async Task Stocktake_Get_Should_Return_Detail_With_Items_Array()
    {
        using var client = AuthedClient(_managerUserId);
        var create = await client.PostAsJsonAsync("/api/v1/inventory/stocktake",
            new { notes = "With items" }, JsonOpts);
        var sessionId = (await create.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("id").GetGuid();

        var res = await client.GetAsync($"/api/v1/inventory/stocktake/{sessionId}");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("id").GetGuid().Should().Be(sessionId);
        body.GetProperty("items").ValueKind.Should().Be(JsonValueKind.Array);
    }

    [Fact]
    public async Task Stocktake_Update_Should_Record_Counts_And_Complete_Session()
    {
        using var client = AuthedClient(_managerUserId);
        var create = await client.PostAsJsonAsync("/api/v1/inventory/stocktake",
            new { notes = "Counting" }, JsonOpts);
        var sessionId = (await create.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("id").GetGuid();

        var update = await client.PutAsJsonAsync($"/api/v1/inventory/stocktake/{sessionId}", new
        {
            items = new[]
            {
                new { asset_type_id = _assetTypeId, physical_quantity = 8, notes = "Found 8" },
            },
            status = "completed",
        }, JsonOpts);

        update.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await update.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("status").GetString().Should().Be("completed");

        // Verify the item row was upserted with system_quantity captured.
        var detail = await client.GetFromJsonAsync<JsonElement>(
            $"/api/v1/inventory/stocktake/{sessionId}");
        detail.GetProperty("items").GetArrayLength().Should().Be(1);
        var item = detail.GetProperty("items")[0];
        item.GetProperty("physical_quantity").GetInt32().Should().Be(8);
    }

    [Fact]
    public async Task Stocktake_Update_Should_Return_409_When_Already_Completed()
    {
        using var client = AuthedClient(_managerUserId);
        var create = await client.PostAsJsonAsync("/api/v1/inventory/stocktake",
            new { notes = "x" }, JsonOpts);
        var sessionId = (await create.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("id").GetGuid();

        var first = await client.PutAsJsonAsync($"/api/v1/inventory/stocktake/{sessionId}",
            new { status = "completed" }, JsonOpts);
        first.StatusCode.Should().Be(HttpStatusCode.OK);

        var second = await client.PutAsJsonAsync($"/api/v1/inventory/stocktake/{sessionId}",
            new { status = "cancelled" }, JsonOpts);
        second.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Stocktake_Get_Should_Return_404_For_Unknown_Id()
    {
        using var client = AuthedClient(_managerUserId);
        var res = await client.GetAsync($"/api/v1/inventory/stocktake/{Guid.NewGuid()}");
        res.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Stocktake_Endpoints_Should_Reject_Coach()
    {
        using var client = AuthedClient(_coachUserId);
        var create = await client.PostAsJsonAsync("/api/v1/inventory/stocktake",
            new { notes = "denied" }, JsonOpts);
        create.StatusCode.Should().Be(HttpStatusCode.Forbidden);

        var list = await client.GetAsync("/api/v1/inventory/stocktake");
        list.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
