using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using SportStock.Api.Data.Entities;
using SportStock.Api.Data.Enums;
using SportStock.Api.Tests.Helpers;

namespace SportStock.Api.Tests;

// Covers /api/v1/asset-names from backend/src/routes/asset-names.ts.
// No upstream jest test existed — this is a fresh suite.
[Collection("Database")]
public sealed class AssetNamesTests : IAsyncLifetime, IDisposable
{
    private const string Prefix = "t_assetnames_";
    private const string ClubPrefix = "AssetNames Test ";
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

    public AssetNamesTests(DbFixture dbFixture)
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
            // ResetAuthAsync deletes test-prefixed users + clubs. Cascade from
            // clubs sweeps asset_categories / asset_names / asset_types rows
            // that belong to those clubs.
            await TestData.ResetAuthAsync(db, Prefix, ClubPrefix);
            _clubId = await TestData.CreateClubAsync(db, ClubPrefix + "Club");
            _adminUserId = await TestData.CreateUserAsync(db, AdminEmail);
            await TestData.CreateMembershipAsync(db, _clubId, _adminUserId, ClubRole.ClubAdmin);
            _managerUserId = await TestData.CreateUserAsync(db, ManagerEmail);
            await TestData.CreateMembershipAsync(db, _clubId, _managerUserId, ClubRole.AssetManager);
            _coachUserId = await TestData.CreateUserAsync(db, CoachEmail);
            await TestData.CreateMembershipAsync(db, _clubId, _coachUserId, ClubRole.Coach);
        });
    }

    public Task DisposeAsync() => Task.CompletedTask;
    public void Dispose() { /* shared static factory */ }

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

    private async Task<Guid> SeedCategoryAsync(string name)
    {
        var id = Guid.NewGuid();
        await _factory.WithDbContextAsync(async db =>
        {
            db.AssetCategories.Add(new AssetCategory
            {
                Id = id,
                ClubId = _clubId,
                Name = name,
                IsSystem = false,
            });
            await db.SaveChangesAsync();
        });
        return id;
    }

    private async Task<Guid> SeedAssetNameAsync(string name, Guid? categoryId = null)
    {
        var id = Guid.NewGuid();
        await _factory.WithDbContextAsync(async db =>
        {
            db.AssetNames.Add(new AssetName
            {
                Id = id,
                ClubId = _clubId,
                Name = name,
                CategoryId = categoryId,
            });
            await db.SaveChangesAsync();
        });
        return id;
    }

    private async Task SeedAssetTypeAsync(Guid assetNameId, bool isActive)
    {
        await _factory.WithDbContextAsync(async db =>
        {
            db.AssetTypes.Add(new AssetType
            {
                Id = Guid.NewGuid(),
                ClubId = _clubId,
                AssetNameId = assetNameId,
                Brand = $"B-{Guid.NewGuid():N}".Substring(0, 8),
                IsActive = isActive,
            });
            await db.SaveChangesAsync();
        });
    }

    // ── GET /api/v1/asset-names ──────────────────────────────────────────────

    [Fact]
    public async Task List_Should_Return_Empty_Array_When_Club_Has_None()
    {
        using var client = AuthedClient(_adminUserId);
        var response = await client.GetAsync("/api/v1/asset-names");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetArrayLength().Should().Be(0);
    }

    [Fact]
    public async Task List_Should_Order_By_Name_Ascending()
    {
        await SeedAssetNameAsync("Zebra Ball");
        await SeedAssetNameAsync("Apple Cone");
        await SeedAssetNameAsync("Mango Net");

        using var client = AuthedClient(_managerUserId);
        var response = await client.GetAsync("/api/v1/asset-names");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetArrayLength().Should().Be(3);
        body[0].GetProperty("name").GetString().Should().Be("Apple Cone");
        body[1].GetProperty("name").GetString().Should().Be("Mango Net");
        body[2].GetProperty("name").GetString().Should().Be("Zebra Ball");
    }

    [Fact]
    public async Task List_Should_Include_CategoryName_When_CategoryId_Set()
    {
        var categoryId = await SeedCategoryAsync("Training Equipment");
        await SeedAssetNameAsync("Cone", categoryId);
        await SeedAssetNameAsync("Uncategorised");

        using var client = AuthedClient(_adminUserId);
        var response = await client.GetAsync("/api/v1/asset-names");

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var withCategory = body.EnumerateArray().Single(x => x.GetProperty("name").GetString() == "Cone");
        withCategory.GetProperty("category_name").GetString().Should().Be("Training Equipment");
        withCategory.GetProperty("category_id").GetGuid().Should().Be(categoryId);

        var withoutCategory = body.EnumerateArray().Single(x => x.GetProperty("name").GetString() == "Uncategorised");
        withoutCategory.GetProperty("category_name").ValueKind.Should().Be(JsonValueKind.Null);
        withoutCategory.GetProperty("category_id").ValueKind.Should().Be(JsonValueKind.Null);
    }

    [Fact]
    public async Task List_Should_Count_Only_Active_AssetTypes()
    {
        var assetNameId = await SeedAssetNameAsync("Multi-Type Ball");
        await SeedAssetTypeAsync(assetNameId, isActive: true);
        await SeedAssetTypeAsync(assetNameId, isActive: true);
        await SeedAssetTypeAsync(assetNameId, isActive: false);

        using var client = AuthedClient(_adminUserId);
        var response = await client.GetAsync("/api/v1/asset-names");

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var target = body.EnumerateArray().Single(x => x.GetProperty("name").GetString() == "Multi-Type Ball");
        target.GetProperty("type_count").GetInt32().Should().Be(2);
    }

    [Fact]
    public async Task List_Should_Be_Accessible_To_Coach()
    {
        using var client = AuthedClient(_coachUserId);
        var response = await client.GetAsync("/api/v1/asset-names");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    // ── POST /api/v1/asset-names ─────────────────────────────────────────────

    [Fact]
    public async Task Create_Should_Return_201_With_Created_AssetName()
    {
        using var client = AuthedClient(_adminUserId);
        var response = await client.PostAsJsonAsync("/api/v1/asset-names", new
        {
            name = "Soccer Ball",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("name").GetString().Should().Be("Soccer Ball");
        body.GetProperty("club_id").GetGuid().Should().Be(_clubId);
        body.GetProperty("id").GetGuid().Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_Should_Trim_Whitespace_From_Name()
    {
        using var client = AuthedClient(_managerUserId);
        var response = await client.PostAsJsonAsync("/api/v1/asset-names", new
        {
            name = "  Goalie Gloves  ",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("name").GetString().Should().Be("Goalie Gloves");
    }

    [Fact]
    public async Task Create_Should_Return_400_When_Name_Missing()
    {
        using var client = AuthedClient(_adminUserId);
        var response = await client.PostAsJsonAsync("/api/v1/asset-names", new
        {
            name = "   ",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("message").GetString().Should().Be("name is required");
    }

    [Fact]
    public async Task Create_Should_Return_409_On_Duplicate_Name_Within_Club()
    {
        using var client = AuthedClient(_adminUserId);
        var first = await client.PostAsJsonAsync("/api/v1/asset-names", new
        {
            name = "Training Vest",
        }, JsonOpts);
        first.StatusCode.Should().Be(HttpStatusCode.Created);

        var dup = await client.PostAsJsonAsync("/api/v1/asset-names", new
        {
            name = "Training Vest",
        }, JsonOpts);

        dup.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var body = await dup.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("message").GetString().Should().Be("Asset name already exists");
    }

    [Fact]
    public async Task Create_Should_Return_403_For_Coach()
    {
        using var client = AuthedClient(_coachUserId);
        var response = await client.PostAsJsonAsync("/api/v1/asset-names", new
        {
            name = "Coach Cannot Create",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ── PUT /api/v1/asset-names/{id} ─────────────────────────────────────────

    [Fact]
    public async Task Update_Should_Change_Name_And_Category()
    {
        var oldCategory = await SeedCategoryAsync("Old Cat");
        var newCategory = await SeedCategoryAsync("New Cat");
        var assetNameId = await SeedAssetNameAsync("Original", oldCategory);

        using var client = AuthedClient(_managerUserId);
        var response = await client.PutAsJsonAsync($"/api/v1/asset-names/{assetNameId}", new
        {
            name = "Renamed",
            category_id = newCategory,
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("name").GetString().Should().Be("Renamed");
        body.GetProperty("category_id").GetGuid().Should().Be(newCategory);
    }

    [Fact]
    public async Task Update_Should_Return_404_For_Unknown_Id()
    {
        using var client = AuthedClient(_adminUserId);
        var response = await client.PutAsJsonAsync($"/api/v1/asset-names/{Guid.NewGuid()}", new
        {
            name = "Anything",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Update_Should_Return_409_On_Duplicate_Name()
    {
        await SeedAssetNameAsync("Existing");
        var targetId = await SeedAssetNameAsync("To Rename");

        using var client = AuthedClient(_adminUserId);
        var response = await client.PutAsJsonAsync($"/api/v1/asset-names/{targetId}", new
        {
            name = "Existing",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Update_Should_Return_403_For_Coach()
    {
        var id = await SeedAssetNameAsync("Locked");
        using var client = AuthedClient(_coachUserId);
        var response = await client.PutAsJsonAsync($"/api/v1/asset-names/{id}", new
        {
            name = "Coach Edit",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ── DELETE /api/v1/asset-names/{id} ──────────────────────────────────────

    [Fact]
    public async Task Delete_Should_Return_204_When_No_Active_Types()
    {
        var id = await SeedAssetNameAsync("To Delete");

        using var client = AuthedClient(_adminUserId);
        var response = await client.DeleteAsync($"/api/v1/asset-names/{id}");

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Delete_Should_Return_409_When_Active_Types_Exist()
    {
        var id = await SeedAssetNameAsync("Has Active Types");
        await SeedAssetTypeAsync(id, isActive: true);

        using var client = AuthedClient(_adminUserId);
        var response = await client.DeleteAsync($"/api/v1/asset-names/{id}");

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("message").GetString()
            .Should().Be("Cannot delete: active asset types are using this name");
    }

    [Fact]
    public async Task Delete_Should_Return_404_For_Unknown_Id()
    {
        using var client = AuthedClient(_adminUserId);
        var response = await client.DeleteAsync($"/api/v1/asset-names/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Delete_Should_Return_403_For_Coach()
    {
        var id = await SeedAssetNameAsync("Locked Delete");
        using var client = AuthedClient(_coachUserId);
        var response = await client.DeleteAsync($"/api/v1/asset-names/{id}");
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
