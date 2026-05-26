using SportStock.Api.Data.Enums;

namespace SportStock.Api.Services;

// Cross-service notification facade. Phase 8 (Loans) needs to fire-and-forget
// loan-state notifications; the real implementation (DB row + FCM push) is
// scheduled for Phase 11. Until then, NoopNotificationService satisfies the
// dependency without actually emitting anything.
public interface INotificationService
{
    Task NotifyClubRolesAsync(
        Guid clubId,
        IReadOnlyList<UserRole> roles,
        NotificationType type,
        string title,
        string body,
        object? payload = null,
        CancellationToken ct = default);

    Task NotifyUserAsync(
        Guid clubId,
        Guid userId,
        NotificationType type,
        string title,
        string body,
        object? payload = null,
        CancellationToken ct = default);
}
