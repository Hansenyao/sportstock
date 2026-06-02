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

// Covers team CRUD + member-management endpoints from
// backend/src/routes/teams.ts. No upstream teams.test.ts existed.
[Collection("Database")]
public sealed class TeamsTests : IAsyncLifetime, IDisposable
{
    private const string Prefix = "t_teams_";
    private const string ClubPrefix = "Teams Test ";
    private const string AdminEmail = Prefix + "admin@test.com";
    private const string ManagerEmail = Prefix + "manager@test.com";
    private const string Coach1Email = Prefix + "coach1@test.com";
    private const string Coach2Email = Prefix + "coach2@test.com";

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
    private Guid _coach1UserId;
    private Guid _coach2UserId;

    public TeamsTests(DbFixture dbFixture)
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
            _coach1UserId = await TestData.CreateUserAsync(db, Coach1Email);
            await TestData.CreateMembershipAsync(db, _clubId, _coach1UserId, ClubRole.Coach);
            _coach2UserId = await TestData.CreateUserAsync(db, Coach2Email);
            await TestData.CreateMembershipAsync(db, _clubId, _coach2UserId, ClubRole.Coach);
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

    private async Task<Guid> SeedTeamAsync(string name = "U10 Mixed", string gender = "Mixed", string ageGroup = "U10")
    {
        var teamId = Guid.NewGuid();
        await _factory.WithDbContextAsync(async db =>
        {
            db.Teams.Add(new Team
            {
                Id = teamId,
                ClubId = _clubId,
                Name = name,
                Gender = gender,
                AgeGroup = ageGroup,
            });
            await db.SaveChangesAsync();
        });
        return teamId;
    }

    // ── List + Get ───────────────────────────────────────────────────────────

    [Fact]
    public async Task List_Should_Return_All_Teams_With_Member_Count()
    {
        var teamA = await SeedTeamAsync("A Team", "Boys", "U12");
        var teamB = await SeedTeamAsync("B Team", "Girls", "U14");

        // Add 1 member to teamA so we can verify member_count.
        await _factory.WithDbContextAsync(async db =>
        {
            db.TeamMembers.Add(new TeamMember
            {
                Id = Guid.NewGuid(),
                TeamId = teamA,
                UserId = _coach1UserId,
                TeamRole = "head_coach",
            });
            await db.SaveChangesAsync();
        });

        using var client = AuthedClient(_adminUserId);
        var response = await client.GetAsync("/api/v1/teams");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetArrayLength().Should().Be(2);
        // Ordered by name ASC → "A Team" first.
        body[0].GetProperty("name").GetString().Should().Be("A Team");
        body[0].GetProperty("member_count").GetInt32().Should().Be(1);
        body[1].GetProperty("name").GetString().Should().Be("B Team");
        body[1].GetProperty("member_count").GetInt32().Should().Be(0);
    }

    [Fact]
    public async Task Get_Should_Return_Team_With_Members_Ordered_By_Role_Then_Name()
    {
        var teamId = await SeedTeamAsync();
        await _factory.WithDbContextAsync(async db =>
        {
            db.TeamMembers.AddRange(
                new TeamMember { Id = Guid.NewGuid(), TeamId = teamId, UserId = _coach1UserId, TeamRole = "assistant_coach" },
                new TeamMember { Id = Guid.NewGuid(), TeamId = teamId, UserId = _coach2UserId, TeamRole = "head_coach" });
            await db.SaveChangesAsync();
        });

        using var client = AuthedClient(_adminUserId);
        var response = await client.GetAsync($"/api/v1/teams/{teamId}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var members = body.GetProperty("members");
        members.GetArrayLength().Should().Be(2);
        // head_coach must come before assistant_coach regardless of insertion order.
        members[0].GetProperty("team_role").GetString().Should().Be("head_coach");
        members[1].GetProperty("team_role").GetString().Should().Be("assistant_coach");
    }

    [Fact]
    public async Task Get_Should_Return_404_When_Team_Unknown()
    {
        using var client = AuthedClient(_adminUserId);
        var response = await client.GetAsync($"/api/v1/teams/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ── Create ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task Create_Should_Return_201_With_Empty_Members_Array()
    {
        using var client = AuthedClient(_adminUserId);
        var response = await client.PostAsJsonAsync("/api/v1/teams", new
        {
            name = "New Team",
            gender = "Mixed",
            age_group = "U10",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("name").GetString().Should().Be("New Team");
        body.GetProperty("members").GetArrayLength().Should().Be(0);
    }

    [Fact]
    public async Task Create_Should_Return_400_For_Invalid_Gender()
    {
        using var client = AuthedClient(_adminUserId);
        var response = await client.PostAsJsonAsync("/api/v1/teams", new
        {
            name = "Bad Gender Team",
            gender = "Other",
            age_group = "U10",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Create_Should_Return_400_For_Invalid_AgeGroup()
    {
        using var client = AuthedClient(_adminUserId);
        var response = await client.PostAsJsonAsync("/api/v1/teams", new
        {
            name = "Bad AgeGroup Team",
            gender = "Mixed",
            age_group = "U99",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Create_Should_Return_403_For_Non_Admin()
    {
        using var client = AuthedClient(_managerUserId);
        var response = await client.PostAsJsonAsync("/api/v1/teams", new
        {
            name = "Manager Cannot Create",
            gender = "Mixed",
            age_group = "U10",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ── Update ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task Update_Should_Change_Name_And_AgeGroup()
    {
        var teamId = await SeedTeamAsync();
        using var client = AuthedClient(_adminUserId);
        var response = await client.PutAsJsonAsync($"/api/v1/teams/{teamId}", new
        {
            name = "Renamed",
            age_group = "U14",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("name").GetString().Should().Be("Renamed");
        body.GetProperty("age_group").GetString().Should().Be("U14");
    }

    // ── Delete ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task Delete_Should_Return_204_And_Cascade_Members()
    {
        var teamId = await SeedTeamAsync();
        await _factory.WithDbContextAsync(async db =>
        {
            db.TeamMembers.Add(new TeamMember
            {
                Id = Guid.NewGuid(),
                TeamId = teamId,
                UserId = _coach1UserId,
                TeamRole = "head_coach",
            });
            await db.SaveChangesAsync();
        });

        using var client = AuthedClient(_adminUserId);
        var response = await client.DeleteAsync($"/api/v1/teams/{teamId}");

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var remainingMembers = await _factory.WithDbContextAsync(async db =>
            await db.TeamMembers.IgnoreQueryFilters().CountAsync(tm => tm.TeamId == teamId));
        remainingMembers.Should().Be(0);
    }

    // ── AddMember ────────────────────────────────────────────────────────────

    [Fact]
    public async Task AddMember_Should_Return_201_When_Coach_And_Role_Valid()
    {
        var teamId = await SeedTeamAsync();
        using var client = AuthedClient(_adminUserId);
        var response = await client.PostAsJsonAsync($"/api/v1/teams/{teamId}/members", new
        {
            user_id = _coach1UserId,
            team_role = "head_coach",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("user_id").GetGuid().Should().Be(_coach1UserId);
        body.GetProperty("team_role").GetString().Should().Be("head_coach");
        body.GetProperty("email").GetString().Should().Be(Coach1Email);
    }

    [Fact]
    public async Task AddMember_Should_Return_400_When_User_Not_Coach()
    {
        var teamId = await SeedTeamAsync();
        using var client = AuthedClient(_adminUserId);
        var response = await client.PostAsJsonAsync($"/api/v1/teams/{teamId}/members", new
        {
            user_id = _managerUserId,
            team_role = "assistant_coach",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task AddMember_Should_Return_400_When_Team_Role_Invalid()
    {
        var teamId = await SeedTeamAsync();
        using var client = AuthedClient(_adminUserId);
        var response = await client.PostAsJsonAsync($"/api/v1/teams/{teamId}/members", new
        {
            user_id = _coach1UserId,
            team_role = "bystander",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task AddMember_Should_Return_409_When_Head_Coach_Already_Exists()
    {
        var teamId = await SeedTeamAsync();
        using var client = AuthedClient(_adminUserId);

        var first = await client.PostAsJsonAsync($"/api/v1/teams/{teamId}/members", new
        {
            user_id = _coach1UserId,
            team_role = "head_coach",
        }, JsonOpts);
        first.StatusCode.Should().Be(HttpStatusCode.Created);

        var second = await client.PostAsJsonAsync($"/api/v1/teams/{teamId}/members", new
        {
            user_id = _coach2UserId,
            team_role = "head_coach",
        }, JsonOpts);

        second.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task AddMember_Should_Return_409_When_Coach_Already_Member()
    {
        var teamId = await SeedTeamAsync();
        using var client = AuthedClient(_adminUserId);

        await client.PostAsJsonAsync($"/api/v1/teams/{teamId}/members", new
        {
            user_id = _coach1UserId,
            team_role = "assistant_coach",
        }, JsonOpts);

        var dup = await client.PostAsJsonAsync($"/api/v1/teams/{teamId}/members", new
        {
            user_id = _coach1UserId,
            team_role = "team_manager",
        }, JsonOpts);

        dup.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    // ── UpdateMember + RemoveMember ──────────────────────────────────────────

    [Fact]
    public async Task UpdateMember_Should_Change_Role()
    {
        var teamId = await SeedTeamAsync();
        using var client = AuthedClient(_adminUserId);
        await client.PostAsJsonAsync($"/api/v1/teams/{teamId}/members", new
        {
            user_id = _coach1UserId,
            team_role = "assistant_coach",
        }, JsonOpts);

        var update = await client.PutAsJsonAsync(
            $"/api/v1/teams/{teamId}/members/{_coach1UserId}",
            new { team_role = "team_manager" },
            JsonOpts);

        update.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await update.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("team_role").GetString().Should().Be("team_manager");
    }

    [Fact]
    public async Task UpdateMember_Should_Return_409_When_Promoting_Second_Head_Coach()
    {
        var teamId = await SeedTeamAsync();
        using var client = AuthedClient(_adminUserId);
        await client.PostAsJsonAsync($"/api/v1/teams/{teamId}/members", new
        {
            user_id = _coach1UserId,
            team_role = "head_coach",
        }, JsonOpts);
        await client.PostAsJsonAsync($"/api/v1/teams/{teamId}/members", new
        {
            user_id = _coach2UserId,
            team_role = "assistant_coach",
        }, JsonOpts);

        var update = await client.PutAsJsonAsync(
            $"/api/v1/teams/{teamId}/members/{_coach2UserId}",
            new { team_role = "head_coach" },
            JsonOpts);

        update.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task RemoveMember_Should_Return_204()
    {
        var teamId = await SeedTeamAsync();
        using var client = AuthedClient(_adminUserId);
        await client.PostAsJsonAsync($"/api/v1/teams/{teamId}/members", new
        {
            user_id = _coach1UserId,
            team_role = "team_manager",
        }, JsonOpts);

        var del = await client.DeleteAsync($"/api/v1/teams/{teamId}/members/{_coach1UserId}");
        del.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task RemoveMember_Should_Return_404_When_Not_Member()
    {
        var teamId = await SeedTeamAsync();
        using var client = AuthedClient(_adminUserId);
        var del = await client.DeleteAsync($"/api/v1/teams/{teamId}/members/{_coach1UserId}");
        del.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
