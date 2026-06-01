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

// Phase 9 — fresh coverage; no upstream write-offs.test.ts existed.
[Collection("Database")]
public sealed class WriteOffsTests : IAsyncLifetime, IDisposable
{
    private const string Prefix = "t_wo_";
    private const string ClubPrefix = "WriteOffs Test ";
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
    private Guid _assetTypeId;
    private Guid _assetBatchId;

    public WriteOffsTests(DbFixture dbFixture)
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
            await TestData.CreateUserAsync(db, AdminEmail, _clubId, UserRole.ClubAdmin);
            _managerUserId = await TestData.CreateUserAsync(db, ManagerEmail, _clubId, UserRole.AssetManager);
            _coachUserId = await TestData.CreateUserAsync(db, CoachEmail, _clubId, UserRole.Coach);
        });
        (_assetTypeId, _assetBatchId) = await SeedAssetAsync("Write-Off Ball", 10);
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

    private async Task<(Guid typeId, Guid batchId)> SeedAssetAsync(string name, int qty)
    {
        var nameId = Guid.NewGuid();
        await _factory.WithDbContextAsync(async db =>
        {
            db.AssetNames.Add(new AssetName
            {
                Id = nameId,
                ClubId = _clubId,
                Name = name,
            });
            await db.SaveChangesAsync();
        });
        using var client = AuthedClient(_managerUserId);
        var res = await client.PostAsJsonAsync("/api/v1/assets", new
        {
            asset_name_id = nameId,
            total_quantity = qty,
        }, JsonOpts);
        res.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        return (body.GetProperty("id").GetGuid(),
                body.GetProperty("batches")[0].GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task Create_Should_Return_201_And_Deduct_From_Stock()
    {
        using var client = AuthedClient(_managerUserId);
        var res = await client.PostAsJsonAsync("/api/v1/write-offs", new
        {
            asset_type_id = _assetTypeId,
            quantity = 3,
            reason = "Broken",
        }, JsonOpts);

        res.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("quantity").GetInt32().Should().Be(3);
        body.GetProperty("source").GetString().Should().Be("manual");
        body.GetProperty("asset_name").GetString().Should().Be("Write-Off Ball");

        var batch = await _factory.WithDbContextAsync(async db =>
            await db.AssetBatches.IgnoreQueryFilters()
                .FirstAsync(b => b.Id == _assetBatchId));
        batch.AvailableQuantity.Should().Be(7);
        batch.TotalQuantity.Should().Be(7);
    }

    [Fact]
    public async Task Create_Should_Emit_WriteOff_StockMovement()
    {
        using var client = AuthedClient(_managerUserId);
        var res = await client.PostAsJsonAsync("/api/v1/write-offs", new
        {
            asset_type_id = _assetTypeId,
            quantity = 1,
            reason = "Test",
        }, JsonOpts);
        res.StatusCode.Should().Be(HttpStatusCode.Created);

        var movementCount = await _factory.WithDbContextAsync(async db =>
            await db.StockMovements.IgnoreQueryFilters()
                .CountAsync(sm => sm.AssetBatchId == _assetBatchId
                    && sm.Type == StockMovementType.WriteOff));
        movementCount.Should().Be(1);
    }

    [Fact]
    public async Task Create_Should_Return_400_When_AssetTypeId_Missing()
    {
        using var client = AuthedClient(_managerUserId);
        var res = await client.PostAsJsonAsync("/api/v1/write-offs", new
        {
            quantity = 1,
        }, JsonOpts);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Create_Should_Return_400_When_Quantity_Zero()
    {
        using var client = AuthedClient(_managerUserId);
        var res = await client.PostAsJsonAsync("/api/v1/write-offs", new
        {
            asset_type_id = _assetTypeId,
            quantity = 0,
        }, JsonOpts);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Create_Should_Return_403_For_Coach()
    {
        using var client = AuthedClient(_coachUserId);
        var res = await client.PostAsJsonAsync("/api/v1/write-offs", new
        {
            asset_type_id = _assetTypeId,
            quantity = 1,
        }, JsonOpts);
        res.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Create_Should_Return_404_When_AssetType_Has_No_Stock()
    {
        // Seed an asset_type directly without any batches — POST /assets
        // rejects total_quantity < 1, so we go through the DbContext.
        var nameId = Guid.NewGuid();
        var orphanType = Guid.NewGuid();
        await _factory.WithDbContextAsync(async db =>
        {
            db.AssetNames.Add(new AssetName
            {
                Id = nameId,
                ClubId = _clubId,
                Name = "Orphan Cone",
            });
            db.AssetTypes.Add(new AssetType
            {
                Id = orphanType,
                ClubId = _clubId,
                AssetNameId = nameId,
                IsActive = true,
            });
            await db.SaveChangesAsync();
        });

        using var client = AuthedClient(_managerUserId);
        var res = await client.PostAsJsonAsync("/api/v1/write-offs", new
        {
            asset_type_id = orphanType,
            quantity = 1,
        }, JsonOpts);
        res.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Create_Should_Return_409_When_Quantity_Exceeds_Available()
    {
        using var client = AuthedClient(_managerUserId);
        var res = await client.PostAsJsonAsync("/api/v1/write-offs", new
        {
            asset_type_id = _assetTypeId,
            quantity = 999,
        }, JsonOpts);
        res.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task List_Should_Return_Paginated_With_Filters()
    {
        using var mgr = AuthedClient(_managerUserId);
        await mgr.PostAsJsonAsync("/api/v1/write-offs", new
        {
            asset_type_id = _assetTypeId,
            quantity = 1,
            reason = "First",
        }, JsonOpts);

        var res = await mgr.GetAsync("/api/v1/write-offs");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("total").GetInt32().Should().BeGreaterThanOrEqualTo(1);

        var filtered = await mgr.GetAsync($"/api/v1/write-offs?source=manual&asset_type_id={_assetTypeId}");
        filtered.StatusCode.Should().Be(HttpStatusCode.OK);
        var body2 = await filtered.Content.ReadFromJsonAsync<JsonElement>();
        body2.GetProperty("data").EnumerateArray()
            .All(w => w.GetProperty("source").GetString() == "manual"
                  && w.GetProperty("asset_type_id").GetGuid() == _assetTypeId)
            .Should().BeTrue();
    }

    [Fact]
    public async Task Get_Should_Return_Detail_And_404_For_Unknown()
    {
        using var client = AuthedClient(_managerUserId);
        var create = await client.PostAsJsonAsync("/api/v1/write-offs", new
        {
            asset_type_id = _assetTypeId,
            quantity = 1,
        }, JsonOpts);
        var id = (await create.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("id").GetGuid();

        var get = await client.GetAsync($"/api/v1/write-offs/{id}");
        get.StatusCode.Should().Be(HttpStatusCode.OK);

        var notFound = await client.GetAsync($"/api/v1/write-offs/{Guid.NewGuid()}");
        notFound.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
