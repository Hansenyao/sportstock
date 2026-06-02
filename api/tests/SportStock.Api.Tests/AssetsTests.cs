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

// Ports backend/tests/assets.test.ts and adds coverage for the endpoints that
// jest didn't reach (batch CRUD, image upload, active-loan-blocks-delete,
// depreciation 422 for missing purchase data, category 409).
[Collection("Database")]
public sealed class AssetsTests : IAsyncLifetime, IDisposable
{
    private const string Prefix = "t_assets_";
    private const string ClubPrefix = "Assets Test ";
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

    public AssetsTests(DbFixture dbFixture)
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
            // Cascade from clubs handles asset_categories / asset_names /
            // asset_types / asset_batches / stock_movements / loans / loan_items.
            await TestData.ResetAuthAsync(db, Prefix, ClubPrefix);
            _clubId = await TestData.CreateClubAsync(db, ClubPrefix + "Club");
            await TestData.CreateWarehouseAsync(db, _clubId);
            _adminUserId = await TestData.CreateUserAsync(db, AdminEmail);
            await TestData.CreateMembershipAsync(db, _clubId, _adminUserId, ClubRole.ClubAdmin);
            _managerUserId = await TestData.CreateUserAsync(db, ManagerEmail);
            await TestData.CreateMembershipAsync(db, _clubId, _managerUserId, ClubRole.AssetManager);
            _coachUserId = await TestData.CreateUserAsync(db, CoachEmail);
            await TestData.CreateMembershipAsync(db, _clubId, _coachUserId, ClubRole.Coach);
        });
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

    private async Task<Guid> SeedAssetNameAsync(string name)
    {
        var id = Guid.NewGuid();
        await _factory.WithDbContextAsync(async db =>
        {
            db.AssetNames.Add(new AssetName
            {
                Id = id,
                ClubId = _clubId,
                Name = name,
            });
            await db.SaveChangesAsync();
        });
        return id;
    }

    private async Task<Guid> CreateAssetViaApiAsync(
        Guid assetNameId, int quantity = 10, decimal? price = 25m, string brand = "Nike")
    {
        using var client = AuthedClient(_managerUserId);
        var res = await client.PostAsJsonAsync("/api/v1/assets", new
        {
            asset_name_id = assetNameId,
            total_quantity = quantity,
            brand,
            purchase_price = price,
            purchase_date = "2024-01-01",
            useful_life_years = 3,
        }, JsonOpts);
        res.StatusCode.Should().Be(HttpStatusCode.Created, await res.Content.ReadAsStringAsync());
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        return body.GetProperty("id").GetGuid();
    }

    // ── Categories ───────────────────────────────────────────────────────────

    [Fact]
    public async Task ListCategories_Should_Include_System_Categories_For_Any_User()
    {
        using var client = AuthedClient(_coachUserId);
        var response = await client.GetAsync("/api/v1/assets/categories");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetArrayLength().Should().BeGreaterThan(0);
        body.EnumerateArray().Any(c => c.GetProperty("is_system").GetBoolean()).Should().BeTrue();
    }

    [Fact]
    public async Task CreateCategory_Should_Return_201_For_Manager()
    {
        using var client = AuthedClient(_managerUserId);
        var unique = $"AssetsCat_{Guid.NewGuid():N}".Substring(0, 24);
        var response = await client.PostAsJsonAsync("/api/v1/assets/categories",
            new { name = unique }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("club_id").GetGuid().Should().Be(_clubId);
        body.GetProperty("name").GetString().Should().Be(unique);
        body.GetProperty("is_system").GetBoolean().Should().BeFalse();
    }

    [Fact]
    public async Task CreateCategory_Should_Return_403_For_Coach()
    {
        using var client = AuthedClient(_coachUserId);
        var response = await client.PostAsJsonAsync("/api/v1/assets/categories",
            new { name = "UnauthCat" }, JsonOpts);
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task CreateCategory_Should_Return_409_On_Duplicate_Name()
    {
        using var client = AuthedClient(_managerUserId);
        var name = $"DupCat_{Guid.NewGuid():N}".Substring(0, 20);
        var first = await client.PostAsJsonAsync("/api/v1/assets/categories",
            new { name }, JsonOpts);
        first.StatusCode.Should().Be(HttpStatusCode.Created);

        var second = await client.PostAsJsonAsync("/api/v1/assets/categories",
            new { name }, JsonOpts);
        second.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var body = await second.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("message").GetString().Should().Be("Category name already exists");
    }

    // ── POST /assets ─────────────────────────────────────────────────────────

    [Fact]
    public async Task CreateAsset_Should_Return_201_With_Available_Status()
    {
        var nameId = await SeedAssetNameAsync("Test Ball");
        using var client = AuthedClient(_managerUserId);
        var response = await client.PostAsJsonAsync("/api/v1/assets", new
        {
            asset_name_id = nameId,
            total_quantity = 10,
            brand = "Nike",
            purchase_price = 25.00,
            purchase_date = "2024-01-01",
            useful_life_years = 3,
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("name").GetString().Should().Be("Test Ball");
        body.GetProperty("status").GetString().Should().Be("available");
        body.GetProperty("club_id").GetGuid().Should().Be(_clubId);
        body.GetProperty("total_quantity").GetInt32().Should().Be(10);
        body.GetProperty("available_quantity").GetInt32().Should().Be(10);
        body.GetProperty("batch_count").GetInt32().Should().Be(1);
        body.GetProperty("batches").GetArrayLength().Should().Be(1);
    }

    [Fact]
    public async Task CreateAsset_Should_Return_403_For_Coach()
    {
        var nameId = await SeedAssetNameAsync("Coach Locked");
        using var client = AuthedClient(_coachUserId);
        var response = await client.PostAsJsonAsync("/api/v1/assets", new
        {
            asset_name_id = nameId,
            total_quantity = 1,
        }, JsonOpts);
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task CreateAsset_Should_Return_400_When_AssetName_Missing()
    {
        using var client = AuthedClient(_managerUserId);
        var response = await client.PostAsJsonAsync("/api/v1/assets", new
        {
            total_quantity = 5,
        }, JsonOpts);
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task CreateAsset_Should_Return_400_When_TotalQuantity_LessThanOne()
    {
        var nameId = await SeedAssetNameAsync("Zero Qty");
        using var client = AuthedClient(_managerUserId);
        var response = await client.PostAsJsonAsync("/api/v1/assets", new
        {
            asset_name_id = nameId,
            total_quantity = 0,
        }, JsonOpts);
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task CreateAsset_Should_Return_404_When_AssetName_Not_In_Club()
    {
        using var client = AuthedClient(_managerUserId);
        var response = await client.PostAsJsonAsync("/api/v1/assets", new
        {
            asset_name_id = Guid.NewGuid(),
            total_quantity = 1,
        }, JsonOpts);
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ── GET /assets list & filters ───────────────────────────────────────────

    [Fact]
    public async Task ListAssets_Should_Return_Paginated_Result_For_Coach()
    {
        var nameId = await SeedAssetNameAsync("Listable Ball");
        await CreateAssetViaApiAsync(nameId);

        using var client = AuthedClient(_coachUserId);
        var response = await client.GetAsync("/api/v1/assets");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("data").ValueKind.Should().Be(JsonValueKind.Array);
        body.GetProperty("total").GetInt32().Should().BeGreaterThanOrEqualTo(1);
        body.GetProperty("page").GetInt32().Should().Be(1);
        body.GetProperty("limit").GetInt32().Should().Be(20);
    }

    [Fact]
    public async Task ListAssets_Should_Filter_By_Status_Available()
    {
        var nameId = await SeedAssetNameAsync("Available Ball");
        await CreateAssetViaApiAsync(nameId);

        using var client = AuthedClient(_coachUserId);
        var response = await client.GetAsync("/api/v1/assets?status=available");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("data").EnumerateArray()
            .All(a => a.GetProperty("status").GetString() == "available")
            .Should().BeTrue();
    }

    [Fact]
    public async Task ListAssets_Should_Filter_By_Search_Term()
    {
        var nameMatch = await SeedAssetNameAsync("CornerFlagSearch");
        var nameOther = await SeedAssetNameAsync("Unrelated Tackle Bag");
        await CreateAssetViaApiAsync(nameMatch);
        await CreateAssetViaApiAsync(nameOther);

        using var client = AuthedClient(_managerUserId);
        var response = await client.GetAsync("/api/v1/assets?search=cornerflag");

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var names = body.GetProperty("data").EnumerateArray()
            .Select(a => a.GetProperty("name").GetString())
            .ToList();
        names.Should().Contain("CornerFlagSearch");
        names.Should().NotContain("Unrelated Tackle Bag");
    }

    // ── GET /assets/:id ──────────────────────────────────────────────────────

    [Fact]
    public async Task GetAsset_Should_Return_Detail_With_Batches()
    {
        var nameId = await SeedAssetNameAsync("Detail Ball");
        var assetId = await CreateAssetViaApiAsync(nameId);

        using var client = AuthedClient(_coachUserId);
        var response = await client.GetAsync($"/api/v1/assets/{assetId}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("id").GetGuid().Should().Be(assetId);
        body.GetProperty("batches").GetArrayLength().Should().BeGreaterThanOrEqualTo(1);
        body.GetProperty("batches")[0].GetProperty("status").GetString().Should().Be("available");
    }

    [Fact]
    public async Task GetAsset_Should_Return_404_For_Unknown_Id()
    {
        using var client = AuthedClient(_coachUserId);
        var response = await client.GetAsync($"/api/v1/assets/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ── PUT /assets/:id ──────────────────────────────────────────────────────

    [Fact]
    public async Task UpdateAsset_Should_Change_Brand_For_Manager()
    {
        var nameId = await SeedAssetNameAsync("Update Brand Ball");
        var assetId = await CreateAssetViaApiAsync(nameId);

        using var client = AuthedClient(_managerUserId);
        var response = await client.PutAsJsonAsync($"/api/v1/assets/{assetId}", new
        {
            brand = "Adidas",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("brand").GetString().Should().Be("Adidas");
    }

    // ── Batch endpoints ──────────────────────────────────────────────────────

    [Fact]
    public async Task AddBatch_Should_Aggregate_Totals_Across_Batches()
    {
        var nameId = await SeedAssetNameAsync("Two Batch Ball");
        var assetId = await CreateAssetViaApiAsync(nameId, quantity: 5);

        using var client = AuthedClient(_managerUserId);
        var response = await client.PostAsJsonAsync($"/api/v1/assets/{assetId}/batches", new
        {
            total_quantity = 7,
            purchase_price = 30.00,
            purchase_date = "2024-06-01",
            useful_life_years = 2,
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("total_quantity").GetInt32().Should().Be(12);
        body.GetProperty("available_quantity").GetInt32().Should().Be(12);
        body.GetProperty("batch_count").GetInt32().Should().Be(2);
        body.GetProperty("batches").GetArrayLength().Should().Be(2);
    }

    [Fact]
    public async Task UpdateBatch_Should_Patch_Notes_Field()
    {
        var nameId = await SeedAssetNameAsync("Batch Notes Ball");
        var assetId = await CreateAssetViaApiAsync(nameId);

        var detail = await AuthedClient(_managerUserId).GetFromJsonAsync<JsonElement>($"/api/v1/assets/{assetId}");
        var batchId = detail.GetProperty("batches")[0].GetProperty("id").GetGuid();

        using var client = AuthedClient(_managerUserId);
        var response = await client.PutAsJsonAsync($"/api/v1/assets/{assetId}/batches/{batchId}",
            new { notes = "Updated note" }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var batch = body.GetProperty("batches").EnumerateArray()
            .Single(b => b.GetProperty("id").GetGuid() == batchId);
        batch.GetProperty("notes").GetString().Should().Be("Updated note");
    }

    [Fact]
    public async Task UpdateBatch_Should_Return_404_For_Unknown_Batch()
    {
        var nameId = await SeedAssetNameAsync("Missing Batch Asset");
        var assetId = await CreateAssetViaApiAsync(nameId);

        using var client = AuthedClient(_managerUserId);
        var response = await client.PutAsJsonAsync(
            $"/api/v1/assets/{assetId}/batches/{Guid.NewGuid()}",
            new { notes = "x" }, JsonOpts);
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ── Depreciation ─────────────────────────────────────────────────────────

    [Fact]
    public async Task GetDepreciation_Should_Return_Computed_Row()
    {
        var nameId = await SeedAssetNameAsync("Dep Ball");
        var assetId = await CreateAssetViaApiAsync(nameId, price: 100m);

        var detail = await AuthedClient(_managerUserId).GetFromJsonAsync<JsonElement>($"/api/v1/assets/{assetId}");
        var batchId = detail.GetProperty("batches")[0].GetProperty("id").GetGuid();

        using var client = AuthedClient(_managerUserId);
        var response = await client.GetAsync(
            $"/api/v1/assets/{assetId}/batches/{batchId}/depreciation");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("batch_id").GetGuid().Should().Be(batchId);
        body.GetProperty("purchase_price").GetDecimal().Should().Be(100m);
        body.TryGetProperty("net_book_value", out _).Should().BeTrue();
    }

    [Fact]
    public async Task GetDepreciation_Should_Return_422_When_Batch_Missing_PurchaseData()
    {
        var nameId = await SeedAssetNameAsync("No Dep Data Ball");
        // Create directly without purchase_price / purchase_date.
        using var seedClient = AuthedClient(_managerUserId);
        var create = await seedClient.PostAsJsonAsync("/api/v1/assets", new
        {
            asset_name_id = nameId,
            total_quantity = 1,
        }, JsonOpts);
        create.StatusCode.Should().Be(HttpStatusCode.Created);
        var detail = await create.Content.ReadFromJsonAsync<JsonElement>();
        var assetId = detail.GetProperty("id").GetGuid();
        var batchId = detail.GetProperty("batches")[0].GetProperty("id").GetGuid();

        using var client = AuthedClient(_managerUserId);
        var response = await client.GetAsync(
            $"/api/v1/assets/{assetId}/batches/{batchId}/depreciation");
        response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
    }

    [Fact]
    public async Task GetDepreciation_Should_Return_404_For_Unknown_Batch()
    {
        var nameId = await SeedAssetNameAsync("Dep Unknown Ball");
        var assetId = await CreateAssetViaApiAsync(nameId);

        using var client = AuthedClient(_managerUserId);
        var response = await client.GetAsync(
            $"/api/v1/assets/{assetId}/batches/{Guid.NewGuid()}/depreciation");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ── DELETE /assets/:id ───────────────────────────────────────────────────

    [Fact]
    public async Task DeleteAsset_Should_Soft_Delete_And_Hide_From_Get()
    {
        var nameId = await SeedAssetNameAsync("Soft Delete Ball");
        var assetId = await CreateAssetViaApiAsync(nameId);

        using var client = AuthedClient(_managerUserId);
        var del = await client.DeleteAsync($"/api/v1/assets/{assetId}");
        del.StatusCode.Should().Be(HttpStatusCode.NoContent);

        using var coachClient = AuthedClient(_coachUserId);
        var check = await coachClient.GetAsync($"/api/v1/assets/{assetId}");
        check.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task DeleteAsset_Should_Return_403_For_Coach()
    {
        var nameId = await SeedAssetNameAsync("Coach Delete Locked");
        var assetId = await CreateAssetViaApiAsync(nameId);

        using var client = AuthedClient(_coachUserId);
        var response = await client.DeleteAsync($"/api/v1/assets/{assetId}");
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task DeleteAsset_Should_Return_409_When_Active_Loan_Exists()
    {
        var nameId = await SeedAssetNameAsync("Loan Blocked Ball");
        var assetId = await CreateAssetViaApiAsync(nameId);

        // Seed a pending loan with a loan_item referencing this asset_type.
        await _factory.WithDbContextAsync(async db =>
        {
            var loan = new Loan
            {
                Id = Guid.NewGuid(),
                ClubId = _clubId,
                CoachId = _coachUserId,
                CreatedBy = _coachUserId,
                Status = LoanStatus.Pending,
                DueDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(7)),
                Reason = "Test loan",
            };
            db.Loans.Add(loan);
            db.LoanItems.Add(new LoanItem
            {
                Id = Guid.NewGuid(),
                LoanId = loan.Id,
                AssetTypeId = assetId,
                Quantity = 1,
            });
            await db.SaveChangesAsync();
        });

        using var client = AuthedClient(_managerUserId);
        var response = await client.DeleteAsync($"/api/v1/assets/{assetId}");
        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("message").GetString()
            .Should().Be("Cannot delete: asset has active or pending loans");
    }

    // ── PUT /assets/:id/image ────────────────────────────────────────────────

    [Fact]
    public async Task UploadImage_Should_Return_200_With_ImageUrl()
    {
        var nameId = await SeedAssetNameAsync("Image Ball");
        var assetId = await CreateAssetViaApiAsync(nameId);

        using var client = AuthedClient(_managerUserId);
        using var content = new MultipartFormDataContent();
        var bytes = new byte[] { 0xFF, 0xD8, 0xFF, 0xE0 }; // JPEG magic header
        var fileContent = new ByteArrayContent(bytes);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        content.Add(fileContent, "image", "ball.jpg");

        var response = await client.PutAsync($"/api/v1/assets/{assetId}/image", content);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("id").GetGuid().Should().Be(assetId);
        body.GetProperty("image_url").GetString().Should().NotBeNullOrEmpty();
    }

    [Fact]
    public async Task UploadImage_Should_Return_400_When_No_File_Provided()
    {
        var nameId = await SeedAssetNameAsync("No File Ball");
        var assetId = await CreateAssetViaApiAsync(nameId);

        using var client = AuthedClient(_managerUserId);
        using var content = new MultipartFormDataContent();
        var response = await client.PutAsync($"/api/v1/assets/{assetId}/image", content);
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }
}
