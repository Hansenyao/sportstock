using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using SportStock.Api.Data;
using SportStock.Api.Data.Enums;
using SportStock.Api.Tests.Helpers;
using Xunit;

namespace SportStock.Api.Tests;

[Collection("Database")]
public sealed class AuthMiddlewareTests : IAsyncLifetime, IDisposable
{
    private readonly DbFixture _dbFixture;
    private readonly SportStockWebApplicationFactory _factory;

    private static SportStockWebApplicationFactory? s_factory;
    private static readonly object s_factoryLock = new();

    public AuthMiddlewareTests(DbFixture dbFixture)
    {
        _dbFixture = dbFixture;
        lock (s_factoryLock)
        {
            s_factory ??= new SportStockWebApplicationFactory().WithDb(dbFixture);
        }
        _factory = s_factory;
    }

    public Task InitializeAsync() => Task.CompletedTask;
    public Task DisposeAsync() => Task.CompletedTask;
    public void Dispose() { }

    private HttpClient AuthedClient(Guid userId, Guid? activeClubId = null, ClubRole? role = null, bool isSupAdmin = false)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", AuthHelper.MintToken(userId, activeClubId, role, isSupAdmin));
        return client;
    }

    [Fact]
    public async Task UnscopedToken_Should_Return200_OnMeEndpoint()
    {
        var userId = await _factory.WithDbContextAsync(db =>
            TestData.CreateUserAsync(db, $"noclub_{Guid.NewGuid()}@test.com"));
        var client = AuthedClient(userId);

        var resp = await client.GetAsync("/api/v1/auth/me");

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task ScopedToken_Should_SetActiveClubIdAndRole()
    {
        var (userId, clubId) = await _factory.WithDbContextAsync(async db =>
        {
            var uid = await TestData.CreateUserAsync(db, $"scoped_{Guid.NewGuid()}@test.com");
            var cid = await TestData.CreateClubAsync(db, uid);
            await TestData.CreateMembershipAsync(db, cid, uid, ClubRole.AssetManager);
            return (uid, cid);
        });
        var client = AuthedClient(userId, clubId, ClubRole.AssetManager);

        var resp = await client.GetAsync("/api/v1/auth/me");

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("active_club_id").GetGuid().Should().Be(clubId);
    }

    [Fact]
    public async Task DeactivatedUser_Should_Return403()
    {
        var userId = await _factory.WithDbContextAsync(db =>
            TestData.CreateUserAsync(db, $"inactive_{Guid.NewGuid()}@test.com", isActive: false));
        var client = AuthedClient(userId);

        var resp = await client.GetAsync("/api/v1/auth/me");

        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task ScopedToken_WithNonMemberClub_Should_Return401()
    {
        var userId = await _factory.WithDbContextAsync(db =>
            TestData.CreateUserAsync(db, $"nomember_{Guid.NewGuid()}@test.com"));
        var randomClubId = Guid.NewGuid();
        var client = AuthedClient(userId, randomClubId, ClubRole.Coach);

        var resp = await client.GetAsync("/api/v1/auth/me");

        resp.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
