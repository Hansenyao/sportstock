using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;
using SportStock.Api.Data;
using SportStock.Api.Data.Entities;
using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.Common;
using SportStock.Api.Dtos.Notifications;
using SportStock.Api.Exceptions;
using SportStock.Api.Integrations;

namespace SportStock.Api.Services;

// Replaces NoopNotificationService once Phase 11 ships. Ports
// backend/src/services/notification.service.ts:
//   - notifications table writes (one row per recipient).
//   - FCM push via IFcmClient — best-effort; failures are swallowed so a
//     bad token never poisons the business path that triggered the notice.
//   - Public read paths (list/mark-read/etc.) scoped to req.user.id.
internal sealed class NotificationService(
    SportStockDbContext db,
    IFcmClient fcm,
    ILogger<NotificationService> log) : INotificationService
{
    private static readonly JsonSerializerOptions PayloadJson = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
    };

    // ── Internal notify helpers ──────────────────────────────────────────────

    public async Task NotifyUserAsync(
        Guid clubId, Guid userId, NotificationType type,
        string title, string body, object? payload = null,
        CancellationToken ct = default)
    {
        var jsonPayload = payload is null ? null : JsonSerializer.Serialize(payload, PayloadJson);

        db.Notifications.Add(new Notification
        {
            Id = Guid.NewGuid(),
            ClubId = clubId,
            UserId = userId,
            Type = type,
            Title = title,
            Body = body,
            Data = jsonPayload,
            IsRead = false,
        });
        await db.SaveChangesAsync(ct);

        // FCM push awaited so the request-scoped DbContext stays
        // single-threaded. PushAsync swallows its own exceptions, so this
        // never bubbles back into the caller's business flow.
        await PushAsync(new[] { userId }, title, body, jsonPayload, ct);
    }

    public async Task NotifyClubRolesAsync(
        Guid clubId, IReadOnlyList<UserRole> roles, NotificationType type,
        string title, string body, object? payload = null,
        CancellationToken ct = default)
    {
        var jsonPayload = payload is null ? null : JsonSerializer.Serialize(payload, PayloadJson);

        var recipients = await db.Users
            .IgnoreQueryFilters()
            .Where(u => u.ClubId == clubId && u.IsActive && roles.Contains(u.Role))
            .Select(u => u.Id)
            .ToListAsync(ct);

        if (recipients.Count == 0) return;

        foreach (var uid in recipients)
        {
            db.Notifications.Add(new Notification
            {
                Id = Guid.NewGuid(),
                ClubId = clubId,
                UserId = uid,
                Type = type,
                Title = title,
                Body = body,
                Data = jsonPayload,
                IsRead = false,
            });
        }
        await db.SaveChangesAsync(ct);

        await PushAsync(recipients, title, body, jsonPayload, ct);
    }

    // ── Public endpoints ─────────────────────────────────────────────────────

    public async Task<PaginatedResult<NotificationResponse>> ListAsync(
        Guid userId, ListNotificationsQuery query, CancellationToken ct = default)
    {
        if (query.Page < 1) query.Page = 1;
        if (query.Limit < 1) query.Limit = 20;

        IQueryable<Notification> source = db.Notifications
            .IgnoreQueryFilters()
            .Where(n => n.UserId == userId);

        // Filter precedence mirrors Node: `unread=true` forces is_read=false;
        // `is_read=true|false` toggles the predicate; anything else means no
        // read-state filter.
        if (IsTrueish(query.Unread))
            source = source.Where(n => !n.IsRead);
        else if (query.IsRead is not null)
            source = source.Where(n => n.IsRead == IsTrueish(query.IsRead));

        var total = await source.CountAsync(ct);
        var data = await source
            .OrderByDescending(n => n.CreatedAt)
            .Skip((query.Page - 1) * query.Limit)
            .Take(query.Limit)
            .Select(n => new NotificationResponse
            {
                Id = n.Id,
                ClubId = n.ClubId,
                UserId = n.UserId,
                Type = n.Type,
                Title = n.Title,
                Body = n.Body,
                Data = n.Data,
                IsRead = n.IsRead,
                CreatedAt = n.CreatedAt,
            })
            .ToListAsync(ct);

        return new PaginatedResult<NotificationResponse>
        {
            Data = data,
            Total = total,
            Page = query.Page,
            Limit = query.Limit,
        };
    }

    public async Task<NotificationResponse> MarkReadAsync(
        Guid notificationId, Guid userId, CancellationToken ct = default)
    {
        var notification = await db.Notifications
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(n => n.Id == notificationId && n.UserId == userId, ct);
        if (notification is null) throw new AppException("Notification not found", 404);

        notification.IsRead = true;
        await db.SaveChangesAsync(ct);

        return new NotificationResponse
        {
            Id = notification.Id,
            ClubId = notification.ClubId,
            UserId = notification.UserId,
            Type = notification.Type,
            Title = notification.Title,
            Body = notification.Body,
            Data = notification.Data,
            IsRead = notification.IsRead,
            CreatedAt = notification.CreatedAt,
        };
    }

    public async Task<MarkAllReadResponse> MarkAllReadAsync(Guid userId, CancellationToken ct = default)
    {
        var updated = await db.Notifications
            .IgnoreQueryFilters()
            .Where(n => n.UserId == userId && !n.IsRead)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.IsRead, true), ct);
        return new MarkAllReadResponse { Updated = updated };
    }

    public async Task RegisterFcmTokenAsync(
        Guid userId, RegisterTokenRequest req, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(req.Token))
            throw new AppException("token is required", 400);

        var deviceInfoJson = req.DeviceInfo is { } el && el.ValueKind != JsonValueKind.Null
            ? el.GetRawText()
            : null;

        var existing = await db.FcmTokens
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(t => t.UserId == userId && t.Token == req.Token, ct);
        if (existing is null)
        {
            db.FcmTokens.Add(new FcmToken
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Token = req.Token,
                DeviceInfo = deviceInfoJson,
            });
        }
        else
        {
            existing.UpdatedAt = DateTime.UtcNow;
            if (deviceInfoJson is not null) existing.DeviceInfo = deviceInfoJson;
        }
        await db.SaveChangesAsync(ct);
    }

    public async Task UnregisterFcmTokenAsync(
        Guid userId, UnregisterTokenRequest req, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(req.Token))
            throw new AppException("token is required", 400);

        await db.FcmTokens
            .IgnoreQueryFilters()
            .Where(t => t.UserId == userId && t.Token == req.Token)
            .ExecuteDeleteAsync(ct);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    // Best-effort FCM push. Caller fire-and-forgets — we never propagate
    // exceptions, and we prune invalid tokens reported by FCM so they don't
    // accumulate forever.
    private async Task PushAsync(
        IReadOnlyList<Guid> userIds, string title, string body, string? jsonPayload, CancellationToken ct)
    {
        try
        {
            var tokens = await db.FcmTokens
                .IgnoreQueryFilters()
                .Where(t => userIds.Contains(t.UserId))
                .Select(t => t.Token)
                .ToListAsync(ct);
            if (tokens.Count == 0) return;

            IReadOnlyDictionary<string, string>? data = null;
            if (!string.IsNullOrEmpty(jsonPayload))
            {
                // Convert object payload to flat string-keyed dict per FCM
                // requirements (data values must be strings).
                using var doc = JsonDocument.Parse(jsonPayload);
                if (doc.RootElement.ValueKind == JsonValueKind.Object)
                {
                    var dict = new Dictionary<string, string>();
                    foreach (var prop in doc.RootElement.EnumerateObject())
                    {
                        dict[prop.Name] = prop.Value.ValueKind switch
                        {
                            JsonValueKind.String => prop.Value.GetString() ?? string.Empty,
                            JsonValueKind.Null => string.Empty,
                            _ => prop.Value.GetRawText(),
                        };
                    }
                    data = dict;
                }
            }

            var invalid = await fcm.SendToTokensAsync(tokens, title, body, data, ct);
            if (invalid.Count > 0)
            {
                await db.FcmTokens
                    .IgnoreQueryFilters()
                    .Where(t => invalid.Contains(t.Token))
                    .ExecuteDeleteAsync(ct);
            }
        }
        catch (Exception ex)
        {
            log.LogWarning(ex, "FCM push failed — notifications were still written to DB.");
        }
    }

    private static bool IsTrueish(string? s) =>
        s is not null && (s.Equals("true", StringComparison.OrdinalIgnoreCase)
                      || s == "1"
                      || s.Equals("yes", StringComparison.OrdinalIgnoreCase));
}
