using System.Net;
using System.Net.Http.Headers;
using FluentAssertions;
using SportStock.Api.Data.Enums;
using SportStock.Api.Tests.Helpers;
using Xunit;

namespace SportStock.Api.Tests;

[Collection("Database")]
public sealed class AuditLogTests : IAsyncLifetime, IDisposable
{
    private readonly DbFixture _dbFixture;
    private readonly SportStockWebApplicationFactory _factory;

    private static SportStockWebApplicationFactory? s_factory;
    private static readonly object s_factoryLock = new();

    private Guid _adminUserId;
    private Guid _clubId;
    private Guid _coachUserId;

    public AuditLogTests(DbFixture dbFixture)
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
        (_adminUserId, _clubId, _coachUserId) = await _factory.WithDbContextAsync(async db =>
        {
            var uid = await TestData.CreateUserAsync(db, $"audit_admin_{Guid.NewGuid()}@test.com");
            var cid = await TestData.CreateClubAsync(db, uid);
            await TestData.CreateMembershipAsync(db, cid, uid, ClubRole.ClubAdmin);
            var coachId = await TestData.CreateUserAsync(db, $"audit_coach_{Guid.NewGuid()}@test.com");
            await TestData.CreateMembershipAsync(db, cid, coachId, ClubRole.Coach);
            return (uid, cid, coachId);
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

    [Fact]
    public async Task ListAuditLogs_Should_Return200_When_ClubAdmin()
    {
        var client = AuthedClient(_adminUserId, _clubId, ClubRole.ClubAdmin);
        var resp = await client.GetAsync("/api/v1/audit-logs");
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task ListAuditLogs_Should_Return403_When_Coach()
    {
        var client = AuthedClient(_coachUserId, _clubId, ClubRole.Coach);
        var resp = await client.GetAsync("/api/v1/audit-logs");
        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
