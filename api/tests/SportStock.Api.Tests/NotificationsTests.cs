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

// Ports backend/tests/notifications.test.ts; adds FCM-token persistence
// and SpyFcmClient assertions for outbound pushes.
[Collection("Database")]
public sealed class NotificationsTests : IAsyncLifetime, IDisposable
{
    private const string Prefix = "t_notif_";
    private const string ClubPrefix = "Notif Test ";
    private const string AdminEmail = Prefix + "admin@test.com";
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
    private Guid _coachUserId;

    public NotificationsTests(DbFixture dbFixture)
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
            _coachUserId = await TestData.CreateUserAsync(db, CoachEmail);
            await TestData.CreateMembershipAsync(db, _clubId, _coachUserId, ClubRole.Coach);

            // Seed a notification on the coach.
            db.Notifications.Add(new Notification
            {
                Id = Guid.NewGuid(),
                ClubId = _clubId,
                UserId = _coachUserId,
                Type = NotificationType.LoanApproved,
                Title = "Test Notif",
                Body = "You have a notification",
                IsRead = false,
            });
            await db.SaveChangesAsync();
        });
    }

    public Task DisposeAsync() => Task.CompletedTask;
    public void Dispose() { }

    private HttpClient AuthedClient(Guid userId, ClubRole? role = null)
    {
        var effectiveRole = role ?? (userId == _adminUserId ? ClubRole.ClubAdmin : ClubRole.Coach);
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", AuthHelper.MintToken(userId, _clubId, effectiveRole));
        return client;
    }

    [Fact]
    public async Task List_Should_Return_User_Notifications()
    {
        using var client = AuthedClient(_coachUserId);
        var res = await client.GetAsync("/api/v1/notifications");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("data").GetArrayLength().Should().BeGreaterThanOrEqualTo(1);
    }

    [Fact]
    public async Task List_Should_Return_Empty_For_User_Without_Notifications()
    {
        using var client = AuthedClient(_adminUserId);
        var res = await client.GetAsync("/api/v1/notifications");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("data").ValueKind.Should().Be(JsonValueKind.Array);
    }

    [Fact]
    public async Task MarkAllRead_Should_Set_IsRead_For_All_User_Notifications()
    {
        using var client = AuthedClient(_coachUserId);
        var put = await client.PutAsync("/api/v1/notifications/read-all", null);
        put.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await put.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("updated").GetInt32().Should().BeGreaterThanOrEqualTo(1);

        var check = await client.GetAsync("/api/v1/notifications?unread=true");
        check.StatusCode.Should().Be(HttpStatusCode.OK);
        var checkBody = await check.Content.ReadFromJsonAsync<JsonElement>();
        checkBody.GetProperty("data").GetArrayLength().Should().Be(0);
    }

    [Fact]
    public async Task MarkRead_Should_Flip_IsRead_For_Single_Notification()
    {
        var notifId = Guid.NewGuid();
        await _factory.WithDbContextAsync(async db =>
        {
            db.Notifications.Add(new Notification
            {
                Id = notifId,
                ClubId = _clubId,
                UserId = _coachUserId,
                Type = NotificationType.LoanRequest,
                Title = "Single Read Test",
                IsRead = false,
            });
            await db.SaveChangesAsync();
        });

        using var client = AuthedClient(_coachUserId);
        var res = await client.PutAsync($"/api/v1/notifications/{notifId}/read", null);
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("is_read").GetBoolean().Should().BeTrue();
    }

    [Fact]
    public async Task MarkRead_Should_Return_404_When_Notification_Belongs_To_Another_User()
    {
        var otherUsersNotifId = Guid.NewGuid();
        await _factory.WithDbContextAsync(async db =>
        {
            db.Notifications.Add(new Notification
            {
                Id = otherUsersNotifId,
                ClubId = _clubId,
                UserId = _coachUserId,
                Type = NotificationType.LoanRequest,
                Title = "Coach-Only",
            });
            await db.SaveChangesAsync();
        });

        using var admin = AuthedClient(_adminUserId);
        var res = await admin.PutAsync($"/api/v1/notifications/{otherUsersNotifId}/read", null);
        res.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task RegisterToken_Should_Persist_FcmToken()
    {
        var token = $"test-fcm-token-{Guid.NewGuid():N}".Substring(0, 32);
        using var client = AuthedClient(_coachUserId);
        var res = await client.PostAsJsonAsync("/api/v1/notifications/fcm-token",
            new { token }, JsonOpts);
        res.StatusCode.Should().Be(HttpStatusCode.Created);

        var exists = await _factory.WithDbContextAsync(async db =>
            await db.FcmTokens.IgnoreQueryFilters()
                .AnyAsync(t => t.UserId == _coachUserId && t.Token == token));
        exists.Should().BeTrue();
    }

    [Fact]
    public async Task RegisterToken_Should_Be_Idempotent_For_Same_Token()
    {
        var token = "duplicate-fcm-token";
        using var client = AuthedClient(_coachUserId);

        var first = await client.PostAsJsonAsync("/api/v1/notifications/fcm-token",
            new { token }, JsonOpts);
        first.StatusCode.Should().Be(HttpStatusCode.Created);

        var second = await client.PostAsJsonAsync("/api/v1/notifications/fcm-token",
            new { token }, JsonOpts);
        second.StatusCode.Should().Be(HttpStatusCode.Created);

        var count = await _factory.WithDbContextAsync(async db =>
            await db.FcmTokens.IgnoreQueryFilters()
                .CountAsync(t => t.UserId == _coachUserId && t.Token == token));
        count.Should().Be(1);
    }

    [Fact]
    public async Task UnregisterToken_Should_Remove_FcmToken()
    {
        var token = $"unreg-{Guid.NewGuid():N}".Substring(0, 24);
        using var client = AuthedClient(_coachUserId);
        await client.PostAsJsonAsync("/api/v1/notifications/fcm-token",
            new { token }, JsonOpts);

        var msg = new HttpRequestMessage(HttpMethod.Delete, "/api/v1/notifications/fcm-token")
        {
            Content = JsonContent.Create(new { token }, options: JsonOpts),
        };
        var res = await client.SendAsync(msg);
        res.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var exists = await _factory.WithDbContextAsync(async db =>
            await db.FcmTokens.IgnoreQueryFilters()
                .AnyAsync(t => t.UserId == _coachUserId && t.Token == token));
        exists.Should().BeFalse();
    }

    [Fact]
    public async Task RegisterToken_Should_Return_400_When_Token_Missing()
    {
        using var client = AuthedClient(_coachUserId);
        var res = await client.PostAsJsonAsync("/api/v1/notifications/fcm-token",
            new { }, JsonOpts);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task LoanApprove_Should_Emit_Push_Through_SpyFcmClient()
    {
        // Register an FCM token for the coach so PushAsync has somewhere to go.
        var token = $"push-spy-{Guid.NewGuid():N}".Substring(0, 24);
        using var coachClient = AuthedClient(_coachUserId);
        var reg = await coachClient.PostAsJsonAsync("/api/v1/notifications/fcm-token",
            new { token }, JsonOpts);
        reg.StatusCode.Should().Be(HttpStatusCode.Created);

        // Seed an asset_type + batch + a pending loan in DB directly.
        var loanId = await _factory.WithDbContextAsync(async db =>
        {
            var nameId = Guid.NewGuid();
            var typeId = Guid.NewGuid();
            var batchId = Guid.NewGuid();
            db.AssetNames.Add(new AssetName { Id = nameId, ClubId = _clubId, Name = "Notif Ball" });
            db.AssetTypes.Add(new AssetType
            {
                Id = typeId, ClubId = _clubId, AssetNameId = nameId, IsActive = true,
            });
            db.AssetBatches.Add(new AssetBatch
            {
                Id = batchId, AssetTypeId = typeId,
                TotalQuantity = 5,
            });
            var lId = Guid.NewGuid();
            db.Loans.Add(new Loan
            {
                Id = lId,
                ClubId = _clubId,
                CoachId = _coachUserId,
                CreatedBy = _coachUserId,
                Status = LoanStatus.Pending,
                DueDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(7)),
            });
            db.LoanItems.Add(new LoanItem
            {
                Id = Guid.NewGuid(),
                LoanId = lId,
                AssetTypeId = typeId,
                Quantity = 1,
            });
            await db.SaveChangesAsync();
            return lId;
        });

        var spy = _factory.GetSpy<SportStock.Api.Integrations.IFcmClient>()
            as SportStock.Api.Tests.Helpers.SpyFcmClient;
        var beforeCount = spy?.Sends.Count ?? 0;

        using var admin = AuthedClient(_adminUserId);
        var approve = await admin.PostAsync($"/api/v1/loans/{loanId}/approve", null);
        approve.StatusCode.Should().Be(HttpStatusCode.OK);

        // Push is fire-and-forget; give the background task a moment to run.
        await Task.Delay(200);
        spy!.Sends.Count.Should().BeGreaterThan(beforeCount);
    }
}
