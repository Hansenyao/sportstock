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

// No upstream users.test.ts existed in the Node backend; this file covers the
// behavior implied by user.service.ts (list/get/create/update/deactivate plus
// the demote-last-admin and self-deactivate guards).
[Collection("Database")]
public sealed class UsersTests : IAsyncLifetime, IDisposable
{
    private const string Prefix = "t_users_";
    private const string ClubPrefix = "Users Test ";
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

    public UsersTests(DbFixture dbFixture)
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

    // ── List ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task List_Should_Return_All_Three_Seeded_Users()
    {
        using var client = AuthedClient(_adminUserId);
        var response = await client.GetAsync("/api/v1/users");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("total").GetInt32().Should().Be(3);
        body.GetProperty("data").GetArrayLength().Should().Be(3);
    }

    [Fact]
    public async Task List_Should_Filter_By_Role()
    {
        using var client = AuthedClient(_adminUserId);
        var response = await client.GetAsync("/api/v1/users?role=coach");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("total").GetInt32().Should().Be(1);
        body.GetProperty("data")[0].GetProperty("email").GetString().Should().Be(CoachEmail);
    }

    [Fact]
    public async Task List_Should_Filter_By_Is_Active_False()
    {
        // Deactivate the coach's club membership so the filter has something to find.
        // In v2, user listing filters on ClubMembership.IsActive, not User.IsActive.
        await _factory.WithDbContextAsync(async db =>
        {
            await db.ClubMemberships.IgnoreQueryFilters()
                .Where(m => m.UserId == _coachUserId && m.ClubId == _clubId)
                .ExecuteUpdateAsync(s => s.SetProperty(m => m.IsActive, false));
        });

        using var client = AuthedClient(_adminUserId);
        var response = await client.GetAsync("/api/v1/users?is_active=false");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("total").GetInt32().Should().Be(1);
        body.GetProperty("data")[0].GetProperty("email").GetString().Should().Be(CoachEmail);
    }

    // ── Get ──────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Get_Should_Return_User_With_Empty_Teams_Array()
    {
        using var client = AuthedClient(_adminUserId);
        var response = await client.GetAsync($"/api/v1/users/{_coachUserId}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("id").GetGuid().Should().Be(_coachUserId);
        body.GetProperty("teams").GetArrayLength().Should().Be(0);
    }

    [Fact]
    public async Task Get_Should_Return_User_With_Teams_When_Coach_Has_Memberships()
    {
        var teamId = Guid.NewGuid();
        await _factory.WithDbContextAsync(async db =>
        {
            db.Teams.Add(new Team
            {
                Id = teamId,
                ClubId = _clubId,
                Name = "U10 Mixed",
                Gender = "Mixed",
                AgeGroup = "U10",
            });
            db.TeamMembers.Add(new TeamMember
            {
                Id = Guid.NewGuid(),
                TeamId = teamId,
                UserId = _coachUserId,
                TeamRole = "head_coach",
            });
            await db.SaveChangesAsync();
        });

        using var client = AuthedClient(_adminUserId);
        var response = await client.GetAsync($"/api/v1/users/{_coachUserId}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var teams = body.GetProperty("teams");
        teams.GetArrayLength().Should().Be(1);
        teams[0].GetProperty("team_id").GetGuid().Should().Be(teamId);
        teams[0].GetProperty("team_role").GetString().Should().Be("head_coach");
        teams[0].GetProperty("team_name").GetString().Should().Be("U10 Mixed");
        teams[0].GetProperty("age_group").GetString().Should().Be("U10");
    }

    [Fact]
    public async Task Get_Should_Return_404_When_Unknown()
    {
        using var client = AuthedClient(_adminUserId);
        var response = await client.GetAsync($"/api/v1/users/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Get_Should_Return_404_When_User_Belongs_To_Other_Club()
    {
        // Seed a separate club + user; current admin must not see them.
        var otherUserId = await _factory.WithDbContextAsync(async db =>
        {
            var otherClubId = await TestData.CreateClubAsync(db, ClubPrefix + "OtherClub");
            var uid = await TestData.CreateUserAsync(db, Prefix + "outsider@test.com");
            await TestData.CreateMembershipAsync(db, otherClubId, uid, ClubRole.Coach);
            return uid;
        });

        using var client = AuthedClient(_adminUserId);
        var response = await client.GetAsync($"/api/v1/users/{otherUserId}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ── Create ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task Create_Should_Return_201_For_Admin()
    {
        using var client = AuthedClient(_adminUserId);
        var response = await client.PostAsJsonAsync("/api/v1/users", new
        {
            email = Prefix + "newcoach@test.com",
            name = "New Coach",
            role = "coach",
            phone = "555-1234",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("email").GetString().Should().Be(Prefix + "newcoach@test.com");
        body.GetProperty("role").GetString().Should().Be("coach");
        body.GetProperty("is_active").GetBoolean().Should().BeTrue();
    }

    [Fact]
    public async Task Create_Should_Return_409_When_Email_Already_Registered()
    {
        using var client = AuthedClient(_adminUserId);
        var response = await client.PostAsJsonAsync("/api/v1/users", new
        {
            email = ManagerEmail,
            name = "Duplicate",
            role = "coach",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Create_Should_Return_400_When_Role_Invalid()
    {
        using var client = AuthedClient(_adminUserId);
        var response = await client.PostAsJsonAsync("/api/v1/users", new
        {
            email = Prefix + "badrole@test.com",
            name = "Bad Role",
            role = "nobody",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Create_Should_Return_403_For_Non_Admin()
    {
        using var client = AuthedClient(_managerUserId);
        var response = await client.PostAsJsonAsync("/api/v1/users", new
        {
            email = Prefix + "shouldntwork@test.com",
            name = "Nope",
            role = "coach",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ── Update ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task Update_Should_Change_Name_When_Admin()
    {
        using var client = AuthedClient(_adminUserId);
        var response = await client.PutAsJsonAsync($"/api/v1/users/{_coachUserId}", new
        {
            name = "Renamed Coach",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("name").GetString().Should().Be("Renamed Coach");
    }

    [Fact]
    public async Task Update_Should_Return_400_When_Role_Invalid()
    {
        using var client = AuthedClient(_adminUserId);
        var response = await client.PutAsJsonAsync($"/api/v1/users/{_coachUserId}", new
        {
            role = "nobody",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Update_Should_Return_409_When_Demoting_Last_Club_Admin()
    {
        // Only one admin exists (the seeded _adminUserId). Demoting them
        // would orphan the club.
        using var client = AuthedClient(_adminUserId);
        var response = await client.PutAsJsonAsync($"/api/v1/users/{_adminUserId}", new
        {
            role = "coach",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Update_Should_Allow_Demoting_Admin_When_Another_Active_Admin_Exists()
    {
        var secondAdminId = await _factory.WithDbContextAsync(async db =>
        {
            var uid = await TestData.CreateUserAsync(db, Prefix + "admin2@test.com");
            await TestData.CreateMembershipAsync(db, _clubId, uid, ClubRole.ClubAdmin);
            return uid;
        });

        using var client = AuthedClient(_adminUserId);
        var response = await client.PutAsJsonAsync($"/api/v1/users/{_adminUserId}", new
        {
            role = "coach",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("role").GetString().Should().Be("coach");
    }

    [Fact]
    public async Task Update_Should_Return_403_For_Non_Admin()
    {
        using var client = AuthedClient(_managerUserId);
        var response = await client.PutAsJsonAsync($"/api/v1/users/{_coachUserId}", new
        {
            name = "Should Not Update",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ── Deactivate ───────────────────────────────────────────────────────────

    [Fact]
    public async Task Deactivate_Should_Return_204_When_Admin()
    {
        using var client = AuthedClient(_adminUserId);
        var response = await client.DeleteAsync($"/api/v1/users/{_managerUserId}");

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // In v2, deactivating a user deactivates their club membership, not the platform user.
        var still = await _factory.WithDbContextAsync(async db =>
            await db.ClubMemberships.IgnoreQueryFilters()
                .FirstAsync(m => m.UserId == _managerUserId && m.ClubId == _clubId));
        still.IsActive.Should().BeFalse();
    }

    [Fact]
    public async Task Deactivate_Should_Return_400_When_Targeting_Self()
    {
        using var client = AuthedClient(_adminUserId);
        var response = await client.DeleteAsync($"/api/v1/users/{_adminUserId}");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Deactivate_Should_Return_404_When_User_Unknown()
    {
        using var client = AuthedClient(_adminUserId);
        var response = await client.DeleteAsync($"/api/v1/users/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Deactivate_Should_Return_403_For_Non_Admin()
    {
        using var client = AuthedClient(_managerUserId);
        var response = await client.DeleteAsync($"/api/v1/users/{_coachUserId}");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
