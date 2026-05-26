using SportStock.Api.Data.Enums;

namespace SportStock.Api.Services;

// Placeholder until Phase 11 ships the real NotificationService. Lets Phase 8
// onward depend on INotificationService without coupling phase order.
internal sealed class NoopNotificationService : INotificationService
{
    public Task NotifyClubRolesAsync(
        Guid clubId, IReadOnlyList<UserRole> roles, NotificationType type,
        string title, string body, object? payload = null,
        CancellationToken ct = default) => Task.CompletedTask;

    public Task NotifyUserAsync(
        Guid clubId, Guid userId, NotificationType type,
        string title, string body, object? payload = null,
        CancellationToken ct = default) => Task.CompletedTask;
}
