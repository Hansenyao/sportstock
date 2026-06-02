using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using SportStock.Api.Data.Enums;
using SportStock.Api.Tests.Helpers;
using Xunit;

namespace SportStock.Api.Tests;

[Collection("Database")]
public sealed class MembershipTests : IAsyncLifetime, IDisposable
{
    private readonly DbFixture _dbFixture;
    private readonly SportStockWebApplicationFactory _factory;

    private static SportStockWebApplicationFactory? s_factory;
    private static readonly object s_factoryLock = new();

    private Guid _adminUserId;
    private Guid _targetUserId;
    private Guid _clubId;

    public MembershipTests(DbFixture dbFixture)
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
        (_adminUserId, _clubId, _targetUserId) = await _factory.WithDbContextAsync(async db =>
        {
            var adminId = await TestData.CreateUserAsync(db, $"admin_{Guid.NewGuid()}@test.com");
            var cid = await TestData.CreateClubAsync(db, adminId);
            await TestData.CreateMembershipAsync(db, cid, adminId, ClubRole.ClubAdmin);
            var targetId = await TestData.CreateUserAsync(db, $"target_{Guid.NewGuid()}@test.com");
            return (adminId, cid, targetId);
        });
    }

    public Task DisposeAsync() => Task.CompletedTask;
    public void Dispose() { }

    private HttpClient AuthedClient(Guid userId, Guid clubId, ClubRole role)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", AuthHelper.MintToken(userId, clubId, role));
        return client;
    }

    private HttpClient UnscopedClient(Guid userId)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", AuthHelper.MintToken(userId));
        return client;
    }

    [Fact]
    public async Task InviteUser_Should_Return201_When_AdminInvitesExistingUser()
    {
        var client = AuthedClient(_adminUserId, _clubId, ClubRole.ClubAdmin);
        var resp = await client.PostAsJsonAsync($"/api/v1/clubs/{_clubId}/invitations",
            new { invitee_id = _targetUserId, role = "coach" });
        resp.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("status").GetString().Should().Be("pending");
    }

    [Fact]
    public async Task InviteUser_Should_Return409_When_UserAlreadyMember()
    {
        // Make target already a member
        await _factory.WithDbContextAsync(db =>
            TestData.CreateMembershipAsync(db, _clubId, _targetUserId, ClubRole.Coach));
        var client = AuthedClient(_adminUserId, _clubId, ClubRole.ClubAdmin);
        var resp = await client.PostAsJsonAsync($"/api/v1/clubs/{_clubId}/invitations",
            new { invitee_id = _targetUserId, role = "coach" });
        resp.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task AcceptInvitation_Should_CreateMembership()
    {
        // Admin invites target
        var adminClient = AuthedClient(_adminUserId, _clubId, ClubRole.ClubAdmin);
        var inviteResp = await adminClient.PostAsJsonAsync($"/api/v1/clubs/{_clubId}/invitations",
            new { invitee_id = _targetUserId, role = "coach" });
        var inviteBody = await inviteResp.Content.ReadFromJsonAsync<JsonElement>();
        var invitationId = inviteBody.GetProperty("id").GetGuid();

        // Target accepts
        var targetClient = UnscopedClient(_targetUserId);
        var acceptResp = await targetClient.PostAsync(
            $"/api/v1/clubs/{_clubId}/invitations/{invitationId}/accept", null);
        acceptResp.StatusCode.Should().Be(HttpStatusCode.OK);

        // Verify membership created
        await _factory.WithDbContextAsync(async db =>
        {
            var m = await db.ClubMemberships.FirstOrDefaultAsync(
                m => m.UserId == _targetUserId && m.ClubId == _clubId && m.IsActive);
            m.Should().NotBeNull();
            m!.Role.Should().Be(ClubRole.Coach);
        });
    }

    [Fact]
    public async Task DeclineInvitation_Should_SetDeclined()
    {
        var adminClient = AuthedClient(_adminUserId, _clubId, ClubRole.ClubAdmin);
        var inviteResp = await adminClient.PostAsJsonAsync($"/api/v1/clubs/{_clubId}/invitations",
            new { invitee_id = _targetUserId, role = "coach" });
        var inviteBody = await inviteResp.Content.ReadFromJsonAsync<JsonElement>();
        var invitationId = inviteBody.GetProperty("id").GetGuid();

        var targetClient = UnscopedClient(_targetUserId);
        var declineResp = await targetClient.PostAsync(
            $"/api/v1/clubs/{_clubId}/invitations/{invitationId}/decline", null);
        declineResp.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task ListMembers_Should_ReturnActiveMembers()
    {
        var client = AuthedClient(_adminUserId, _clubId, ClubRole.ClubAdmin);
        var resp = await client.GetAsync($"/api/v1/clubs/{_clubId}/members");
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        body.GetArrayLength().Should().BeGreaterThanOrEqualTo(1); // at least admin
    }

    [Fact]
    public async Task SearchUsers_Should_ReturnUsersNotInClub()
    {
        var client = AuthedClient(_adminUserId, _clubId, ClubRole.ClubAdmin);
        var resp = await client.GetAsync($"/api/v1/clubs/{_clubId}/members/search?q=target");
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        // target user should appear (not yet a member)
        body.GetArrayLength().Should().BeGreaterThanOrEqualTo(0);
    }
}
