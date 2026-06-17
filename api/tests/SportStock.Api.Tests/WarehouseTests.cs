using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using SportStock.Api.Data.Enums;
using SportStock.Api.Tests.Helpers;
using Xunit;

namespace SportStock.Api.Tests;

[Collection("Database")]
public sealed class WarehouseTests : IAsyncLifetime, IDisposable
{
    private readonly DbFixture _dbFixture;
    private readonly SportStockWebApplicationFactory _factory;

    private static SportStockWebApplicationFactory? s_factory;
    private static readonly object s_factoryLock = new();

    private Guid _adminUserId;
    private Guid _clubId;

    public WarehouseTests(DbFixture dbFixture)
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
        (_adminUserId, _clubId) = await _factory.WithDbContextAsync(async db =>
        {
            var uid = await TestData.CreateUserAsync(db, $"wh_admin_{Guid.NewGuid()}@test.com");
            var cid = await TestData.CreateClubAsync(db, uid);
            await TestData.CreateMembershipAsync(db, cid, uid, ClubRole.ClubAdmin);
            return (uid, cid);
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
    public async Task CreateWarehouse_Should_Return201_When_AdminCreates()
    {
        var client = AuthedClient(_adminUserId, _clubId, ClubRole.ClubAdmin);
        var resp = await client.PostAsJsonAsync("/api/v1/warehouses",
            new { name = $"Storage_{Guid.NewGuid()}", description = "Ground floor" });
        resp.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task CreateWarehouse_Should_Return409_When_DuplicateName()
    {
        var name = $"Duplicate_{Guid.NewGuid()}";
        var client = AuthedClient(_adminUserId, _clubId, ClubRole.ClubAdmin);
        await client.PostAsJsonAsync("/api/v1/warehouses", new { name });
        var resp = await client.PostAsJsonAsync("/api/v1/warehouses", new { name });
        resp.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task ListWarehouses_Should_SetAutoSelect_When_OnlyOneExists()
    {
        // Use a fresh club so this test is isolated from warehouses created by other tests
        var (uid, cid) = await _factory.WithDbContextAsync(async db =>
        {
            var u = await TestData.CreateUserAsync(db, $"wh_solo_{Guid.NewGuid()}@test.com");
            var c = await TestData.CreateClubAsync(db, u);
            await TestData.CreateMembershipAsync(db, c, u, ClubRole.ClubAdmin);
            return (u, c);
        });

        var client = AuthedClient(uid, cid, ClubRole.ClubAdmin);
        await client.PostAsJsonAsync("/api/v1/warehouses", new { name = $"Only_{Guid.NewGuid()}" });

        var resp = await client.GetAsync("/api/v1/warehouses");
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("auto_select").GetBoolean().Should().BeTrue();
    }

    [Fact]
    public async Task ListWarehouses_Should_NotAutoSelect_When_MultipleExist()
    {
        // Use a fresh club so this test is isolated
        var (uid, cid) = await _factory.WithDbContextAsync(async db =>
        {
            var u = await TestData.CreateUserAsync(db, $"wh_multi_{Guid.NewGuid()}@test.com");
            var c = await TestData.CreateClubAsync(db, u);
            await TestData.CreateMembershipAsync(db, c, u, ClubRole.ClubAdmin);
            return (u, c);
        });

        var client = AuthedClient(uid, cid, ClubRole.ClubAdmin);
        await client.PostAsJsonAsync("/api/v1/warehouses", new { name = $"WH1_{Guid.NewGuid()}" });
        await client.PostAsJsonAsync("/api/v1/warehouses", new { name = $"WH2_{Guid.NewGuid()}" });

        var resp = await client.GetAsync("/api/v1/warehouses");
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("auto_select").GetBoolean().Should().BeFalse();
    }

    [Fact]
    public async Task UpdateWarehouse_Should_Return204()
    {
        var client = AuthedClient(_adminUserId, _clubId, ClubRole.ClubAdmin);
        var createResp = await client.PostAsJsonAsync("/api/v1/warehouses",
            new { name = $"ToUpdate_{Guid.NewGuid()}" });
        var id = (await createResp.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        var resp = await client.PutAsJsonAsync($"/api/v1/warehouses/{id}",
            new { name = $"Updated_{Guid.NewGuid()}", description = "Updated desc" });
        resp.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }
}
