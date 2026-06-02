using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using SportStock.Api.Data.Entities;
using SportStock.Api.Tests.Helpers;
using Xunit;

namespace SportStock.Api.Tests;

[Collection("Database")]
public sealed class SportTypeTests : IAsyncLifetime, IDisposable
{
    private const string Prefix = "t_st_";

    private readonly DbFixture _dbFixture;
    private readonly SportStockWebApplicationFactory _factory;

    private static SportStockWebApplicationFactory? s_factory;
    private static readonly object s_factoryLock = new();

    private Guid _superAdminId;

    public SportTypeTests(DbFixture dbFixture)
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
        _superAdminId = await _factory.WithDbContextAsync(async db =>
        {
            // Clean up any leftover test users from previous runs.
            await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
                .ExecuteDeleteAsync(db.Users.IgnoreQueryFilters()
                    .Where(u => u.Email.StartsWith(Prefix)));

            var user = new User
            {
                Id           = Guid.NewGuid(),
                Email        = Prefix + "sa@test.com",
                PasswordHash = TestData.PasswordHash,
                FirstName    = "Super",
                LastName     = "Admin",
                IsSupAdmin   = true,
                EmailVerified = true,
                IsActive     = true,
            };
            db.Users.Add(user);
            await db.SaveChangesAsync();
            return user.Id;
        });
    }

    public Task DisposeAsync() => Task.CompletedTask;
    public void Dispose() { }

    private HttpClient SuperAdminClient()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer",
                AuthHelper.MintToken(_superAdminId, activeClubId: null, role: null, isSupAdmin: true));
        return client;
    }

    [Fact]
    public async Task GetSportTypes_Should_ReturnActiveTypes_WhenPublic()
    {
        // No auth required
        using var client = _factory.CreateClient();
        var resp = await client.GetAsync("/api/v1/sport-types");
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        body.GetArrayLength().Should().BeGreaterThan(0); // seeded defaults (Soccer etc.)
    }

    [Fact]
    public async Task CreateSportType_Should_Return201_When_SuperAdmin()
    {
        using var client = SuperAdminClient();
        var resp = await client.PostAsJsonAsync("/api/v1/admin/settings/sport-types",
            new { name = $"Volleyball_{Guid.NewGuid()}", sort_order = 10 });
        resp.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task AdminListSportTypes_Should_ReturnAllTypes_When_SuperAdmin()
    {
        using var client = SuperAdminClient();
        var resp = await client.GetAsync("/api/v1/admin/settings/sport-types");
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        body.GetArrayLength().Should().BeGreaterThan(0);
    }

    [Fact]
    public async Task CreateSportType_Should_Return409_When_DuplicateName()
    {
        using var client = SuperAdminClient();
        // "Soccer" is seeded in db-init.sql
        var resp = await client.PostAsJsonAsync("/api/v1/admin/settings/sport-types",
            new { name = "Soccer", sort_order = 0 });
        resp.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task UpdateSportType_Should_Return204_When_SuperAdmin()
    {
        // Create one first, then update it.
        using var client = SuperAdminClient();
        var uniqueName = $"UpdateMe_{Guid.NewGuid()}";
        var createResp = await client.PostAsJsonAsync("/api/v1/admin/settings/sport-types",
            new { name = uniqueName, sort_order = 5 });
        createResp.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = await createResp.Content.ReadFromJsonAsync<JsonElement>();
        var id = created.GetProperty("id").GetGuid();

        var putResp = await client.PutAsJsonAsync($"/api/v1/admin/settings/sport-types/{id}",
            new { name = uniqueName + "_updated", sort_order = 7, is_active = true });
        putResp.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task DeleteSportType_Should_Return204_And_SoftDelete()
    {
        using var client = SuperAdminClient();
        var uniqueName = $"DeleteMe_{Guid.NewGuid()}";
        var createResp = await client.PostAsJsonAsync("/api/v1/admin/settings/sport-types",
            new { name = uniqueName, sort_order = 50 });
        createResp.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = await createResp.Content.ReadFromJsonAsync<JsonElement>();
        var id = created.GetProperty("id").GetGuid();

        var delResp = await client.DeleteAsync($"/api/v1/admin/settings/sport-types/{id}");
        delResp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // The public list endpoint should no longer show the soft-deleted type.
        using var anonClient = _factory.CreateClient();
        var listResp = await anonClient.GetAsync("/api/v1/sport-types");
        var body = await listResp.Content.ReadFromJsonAsync<JsonElement>();
        var names = body.EnumerateArray().Select(e => e.GetProperty("name").GetString()).ToList();
        names.Should().NotContain(uniqueName);
    }
}
