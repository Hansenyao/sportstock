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

// Ports backend/tests/loans.test.ts; augments with 4-bucket return,
// multi-batch FIFO checkout, auto write-off creation, RBAC visibility.
[Collection("Database")]
public sealed class LoansTests : IAsyncLifetime, IDisposable
{
    private const string Prefix = "t_loans_";
    private const string ClubPrefix = "Loans Test ";
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

    private static readonly DateOnly Tomorrow = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1));
    private static readonly DateOnly Yesterday = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1));

    public LoansTests(DbFixture dbFixture)
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
        _assetTypeId = await CreateAssetTypeAsync("Test Jersey", 10);
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

    private async Task<Guid> CreateAssetTypeAsync(string name, int qty)
    {
        var assetNameId = Guid.NewGuid();
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
            purchase_price = 10.00,
            purchase_date = "2024-01-01",
            useful_life_years = 3,
        }, JsonOpts);
        res.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        return body.GetProperty("id").GetGuid();
    }

    private async Task<Guid> CreateLoanAsync(Guid actorId, int qty = 2)
    {
        using var client = AuthedClient(actorId);
        var res = await client.PostAsJsonAsync("/api/v1/loans", new
        {
            items = new[] { new { asset_type_id = _assetTypeId, quantity = qty } },
            reason = "Training",
            due_date = Tomorrow.ToString("yyyy-MM-dd"),
        }, JsonOpts);
        res.StatusCode.Should().Be(HttpStatusCode.Created, await res.Content.ReadAsStringAsync());
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        return body.GetProperty("id").GetGuid();
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    [Fact]
    public async Task Create_Should_Return_201_With_Pending_Status_When_Coach()
    {
        using var client = AuthedClient(_coachUserId);
        var res = await client.PostAsJsonAsync("/api/v1/loans", new
        {
            items = new[] { new { asset_type_id = _assetTypeId, quantity = 2 } },
            reason = "Training",
            due_date = Tomorrow.ToString("yyyy-MM-dd"),
        }, JsonOpts);

        res.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("status").GetString().Should().Be("pending");
        body.GetProperty("items").GetArrayLength().Should().Be(1);
        body.GetProperty("items")[0].GetProperty("asset_type_id").GetGuid().Should().Be(_assetTypeId);
        body.GetProperty("items")[0].GetProperty("quantity").GetInt32().Should().Be(2);
    }

    [Fact]
    public async Task Create_Should_Return_400_When_Manager_Without_CoachId()
    {
        using var client = AuthedClient(_managerUserId);
        var res = await client.PostAsJsonAsync("/api/v1/loans", new
        {
            items = new[] { new { asset_type_id = _assetTypeId, quantity = 1 } },
            due_date = Tomorrow.ToString("yyyy-MM-dd"),
        }, JsonOpts);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task List_Should_Return_All_For_Admin()
    {
        await CreateLoanAsync(_coachUserId);
        using var client = AuthedClient(_adminUserId);
        var res = await client.GetAsync("/api/v1/loans");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("total").GetInt32().Should().BeGreaterThanOrEqualTo(1);
    }

    [Fact]
    public async Task List_Should_Be_Restricted_To_Own_Loans_For_Coach()
    {
        await CreateLoanAsync(_coachUserId);
        using var client = AuthedClient(_coachUserId);
        var res = await client.GetAsync("/api/v1/loans");

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("data").EnumerateArray()
            .All(l => l.GetProperty("coach_id").GetGuid() == _coachUserId)
            .Should().BeTrue();
    }

    [Fact]
    public async Task Get_Should_Return_Loan_Detail_For_Manager()
    {
        var loanId = await CreateLoanAsync(_coachUserId);
        using var client = AuthedClient(_managerUserId);
        var res = await client.GetAsync($"/api/v1/loans/{loanId}");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("id").GetGuid().Should().Be(loanId);
    }

    [Fact]
    public async Task Approve_Should_Flip_Status_And_Reject_Duplicate()
    {
        var loanId = await CreateLoanAsync(_coachUserId);
        using var mgr = AuthedClient(_managerUserId);

        var first = await mgr.PostAsync($"/api/v1/loans/{loanId}/approve", null);
        first.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await first.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("status").GetString().Should().Be("approved");

        var second = await mgr.PostAsync($"/api/v1/loans/{loanId}/approve", null);
        second.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Checkout_Should_Move_Loan_To_CheckedOut_Status()
    {
        var loanId = await CreateLoanAsync(_coachUserId);
        using var mgr = AuthedClient(_managerUserId);
        var approve = await mgr.PostAsync($"/api/v1/loans/{loanId}/approve", null);
        approve.StatusCode.Should().Be(HttpStatusCode.OK);

        using var coach = AuthedClient(_coachUserId);
        var res = await coach.PostAsync($"/api/v1/loans/{loanId}/checkout", null);
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("status").GetString().Should().Be("checked_out");
    }

    [Fact]
    public async Task Return_Should_Complete_Loan_Cycle_All_Good()
    {
        var loanId = await CreateLoanAsync(_coachUserId);
        using var mgr = AuthedClient(_managerUserId);
        (await mgr.PostAsync($"/api/v1/loans/{loanId}/approve", null)).EnsureSuccessStatusCode();

        using var coach = AuthedClient(_coachUserId);
        (await coach.PostAsync($"/api/v1/loans/{loanId}/checkout", null)).EnsureSuccessStatusCode();

        var detail = await mgr.GetFromJsonAsync<JsonElement>($"/api/v1/loans/{loanId}");
        var items = detail.GetProperty("items").EnumerateArray()
            .Select(i => new
            {
                loan_item_id = i.GetProperty("id").GetGuid(),
                good_quantity = i.GetProperty("quantity").GetInt32(),
                minor_damage_quantity = 0,
                write_off_quantity = 0,
                lost_quantity = 0,
            })
            .ToArray();

        var res = await mgr.PostAsJsonAsync($"/api/v1/loans/{loanId}/return",
            new { items, notes = "All good" }, JsonOpts);

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("status").GetString().Should().Be("returned");
    }

    [Fact]
    public async Task Reject_Should_Set_Status_And_Reason()
    {
        var loanId = await CreateLoanAsync(_coachUserId);
        using var mgr = AuthedClient(_managerUserId);
        var res = await mgr.PostAsJsonAsync($"/api/v1/loans/{loanId}/reject",
            new { reason = "Not enough stock" }, JsonOpts);

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("status").GetString().Should().Be("rejected");
        body.GetProperty("rejection_reason").GetString().Should().Be("Not enough stock");
    }

    // ── Validation ───────────────────────────────────────────────────────────

    [Fact]
    public async Task Create_Should_Return_400_When_DueDate_Missing()
    {
        using var client = AuthedClient(_coachUserId);
        var res = await client.PostAsJsonAsync("/api/v1/loans", new
        {
            items = new[] { new { asset_type_id = _assetTypeId, quantity = 1 } },
        }, JsonOpts);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Create_Should_Return_400_When_DueDate_In_Past()
    {
        using var client = AuthedClient(_coachUserId);
        var res = await client.PostAsJsonAsync("/api/v1/loans", new
        {
            items = new[] { new { asset_type_id = _assetTypeId, quantity = 1 } },
            due_date = Yesterday.ToString("yyyy-MM-dd"),
        }, JsonOpts);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Create_Should_Return_404_For_Unknown_AssetType()
    {
        using var client = AuthedClient(_coachUserId);
        var res = await client.PostAsJsonAsync("/api/v1/loans", new
        {
            items = new[] { new { asset_type_id = Guid.NewGuid(), quantity = 1 } },
            due_date = Tomorrow.ToString("yyyy-MM-dd"),
        }, JsonOpts);
        res.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Create_Should_Return_409_When_Insufficient_Stock()
    {
        using var client = AuthedClient(_coachUserId);
        var res = await client.PostAsJsonAsync("/api/v1/loans", new
        {
            items = new[] { new { asset_type_id = _assetTypeId, quantity = 9999 } },
            due_date = Tomorrow.ToString("yyyy-MM-dd"),
        }, JsonOpts);
        res.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    // ── Multi-batch FIFO + 4-bucket return ───────────────────────────────────

    [Fact]
    public async Task Return_With_FourBucket_Split_Should_Emit_WriteOffOrders()
    {
        // Need a larger inventory so we can split. Existing asset has 10
        // available; loan 5 with a 4-bucket split on return.
        var loanId = await CreateLoanAsync(_coachUserId, qty: 5);
        using var mgr = AuthedClient(_managerUserId);
        (await mgr.PostAsync($"/api/v1/loans/{loanId}/approve", null)).EnsureSuccessStatusCode();
        using var coach = AuthedClient(_coachUserId);
        (await coach.PostAsync($"/api/v1/loans/{loanId}/checkout", null)).EnsureSuccessStatusCode();

        var detail = await mgr.GetFromJsonAsync<JsonElement>($"/api/v1/loans/{loanId}");
        var itemId = detail.GetProperty("items")[0].GetProperty("id").GetGuid();

        var res = await mgr.PostAsJsonAsync($"/api/v1/loans/{loanId}/return", new
        {
            items = new[]
            {
                new
                {
                    loan_item_id = itemId,
                    good_quantity = 2,
                    minor_damage_quantity = 1,
                    write_off_quantity = 1,
                    lost_quantity = 1,
                },
            },
        }, JsonOpts);
        res.StatusCode.Should().Be(HttpStatusCode.OK, await res.Content.ReadAsStringAsync());

        var (writeOffCount, lostCount) = await _factory.WithDbContextAsync(async db =>
        {
            var wo = await db.WriteOffOrders.IgnoreQueryFilters()
                .CountAsync(w => w.LoanItemId == itemId && w.Source == WriteOffSource.LoanReturn);
            var lo = await db.WriteOffOrders.IgnoreQueryFilters()
                .CountAsync(w => w.LoanItemId == itemId && w.Source == WriteOffSource.LoanLost);
            return (wo, lo);
        });
        writeOffCount.Should().Be(1);
        lostCount.Should().Be(1);
    }

    [Fact]
    public async Task Return_Should_Return_400_When_Bucket_Sum_Mismatches_Quantity()
    {
        var loanId = await CreateLoanAsync(_coachUserId, qty: 2);
        using var mgr = AuthedClient(_managerUserId);
        (await mgr.PostAsync($"/api/v1/loans/{loanId}/approve", null)).EnsureSuccessStatusCode();
        using var coach = AuthedClient(_coachUserId);
        (await coach.PostAsync($"/api/v1/loans/{loanId}/checkout", null)).EnsureSuccessStatusCode();

        var detail = await mgr.GetFromJsonAsync<JsonElement>($"/api/v1/loans/{loanId}");
        var itemId = detail.GetProperty("items")[0].GetProperty("id").GetGuid();

        var res = await mgr.PostAsJsonAsync($"/api/v1/loans/{loanId}/return", new
        {
            items = new[]
            {
                new
                {
                    loan_item_id = itemId,
                    good_quantity = 5,
                    minor_damage_quantity = 0,
                    write_off_quantity = 0,
                    lost_quantity = 0,
                },
            },
        }, JsonOpts);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    // ── Edit / Delete ────────────────────────────────────────────────────────

    [Fact]
    public async Task Delete_Should_Succeed_When_Creator_And_Pending()
    {
        var loanId = await CreateLoanAsync(_coachUserId);
        using var client = AuthedClient(_coachUserId);
        var res = await client.DeleteAsync($"/api/v1/loans/{loanId}");
        res.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Delete_Should_Return_409_When_Loan_Not_Pending()
    {
        var loanId = await CreateLoanAsync(_coachUserId);
        using var mgr = AuthedClient(_managerUserId);
        (await mgr.PostAsync($"/api/v1/loans/{loanId}/approve", null)).EnsureSuccessStatusCode();

        using var coach = AuthedClient(_coachUserId);
        var res = await coach.DeleteAsync($"/api/v1/loans/{loanId}");
        res.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Patch_Should_Replace_Items_When_Pending()
    {
        var loanId = await CreateLoanAsync(_coachUserId, qty: 1);
        using var client = AuthedClient(_coachUserId);
        var res = await client.PatchAsJsonAsync($"/api/v1/loans/{loanId}", new
        {
            items = new[] { new { asset_type_id = _assetTypeId, quantity = 3 } },
            reason = "Updated reason",
        }, JsonOpts);

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("items").GetArrayLength().Should().Be(1);
        body.GetProperty("items")[0].GetProperty("quantity").GetInt32().Should().Be(3);
        body.GetProperty("reason").GetString().Should().Be("Updated reason");
    }

    // ── Item-level checkout assignments ──────────────────────────────────────

    [Fact]
    public async Task Checkout_Should_CreateLoanItemAssignments()
    {
        // Arrange: create a dedicated asset type + 2 asset_items for this test.
        Guid typeId = default;
        Guid warehouseId = default;

        await _factory.WithDbContextAsync(async db =>
        {
            // Warehouse
            var wh = new Warehouse
            {
                Id       = Guid.NewGuid(),
                ClubId   = _clubId,
                Name     = "Loans Test Warehouse",
                IsActive = true,
            };
            db.Warehouses.Add(wh);
            await db.SaveChangesAsync();
            warehouseId = wh.Id;

            // Asset name + type
            var assetName = new AssetName
            {
                Id     = Guid.NewGuid(),
                ClubId = _clubId,
                Name   = "Checkout Assignment Test Ball",
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
            typeId = assetType.Id;

            // Seed 2 available asset_items for the type.
            await TestData.CreateAssetItemAsync(db, _clubId, typeId, warehouseId);
            await TestData.CreateAssetItemAsync(db, _clubId, typeId, warehouseId);
        });

        // Create a loan for qty=2, approve it, then checkout as coach.
        using var mgr   = AuthedClient(_managerUserId);
        using var coach = AuthedClient(_coachUserId);

        var createRes = await coach.PostAsJsonAsync("/api/v1/loans", new
        {
            items    = new[] { new { asset_type_id = typeId, quantity = 2 } },
            reason   = "Assignment test",
            due_date = Tomorrow.ToString("yyyy-MM-dd"),
        }, JsonOpts);
        createRes.StatusCode.Should().Be(HttpStatusCode.Created,
            await createRes.Content.ReadAsStringAsync());
        var loanId = (await createRes.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("id").GetGuid();

        (await mgr.PostAsync($"/api/v1/loans/{loanId}/approve", null)).EnsureSuccessStatusCode();

        var checkoutRes = await coach.PostAsync($"/api/v1/loans/{loanId}/checkout", null);
        checkoutRes.StatusCode.Should().Be(HttpStatusCode.OK,
            await checkoutRes.Content.ReadAsStringAsync());

        // Assert: loan_item_assignments were created and items are on_loan.
        await _factory.WithDbContextAsync(async db =>
        {
            var assignments = await db.LoanItemAssignments
                .Where(a => a.LoanItem.LoanId == loanId)
                .ToListAsync();
            assignments.Should().HaveCount(2);

            foreach (var assignment in assignments)
            {
                var item = await db.AssetItems.FindAsync(assignment.AssetItemId);
                item!.Status.Should().Be(AssetItemStatus.OnLoan);
            }
        });
    }
}
