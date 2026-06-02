using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.Common;
using SportStock.Api.Dtos.Notifications;

namespace SportStock.Api.Services;

// Combines the internal fire-and-forget surface (NotifyUser /
// NotifyClubRoles) used by LoanService etc. with the public user-facing
// list / mark-read / FCM-token methods consumed by NotificationsController.
public interface INotificationService
{
    // Internal — write to notifications + push via FCM. Fire-and-forget at
    // call sites; failures should not bubble back up to the caller.
    Task NotifyClubRolesAsync(
        Guid clubId, IReadOnlyList<ClubRole> roles, NotificationType type,
        string title, string body, object? payload = null,
        CancellationToken ct = default);

    Task NotifyUserAsync(
        Guid clubId, Guid userId, NotificationType type,
        string title, string body, object? payload = null,
        CancellationToken ct = default);

    // Public endpoints
    Task<PaginatedResult<NotificationResponse>> ListAsync(
        Guid userId, ListNotificationsQuery query, CancellationToken ct = default);

    Task<NotificationResponse> MarkReadAsync(
        Guid notificationId, Guid userId, CancellationToken ct = default);

    Task<MarkAllReadResponse> MarkAllReadAsync(Guid userId, CancellationToken ct = default);

    Task RegisterFcmTokenAsync(
        Guid userId, RegisterTokenRequest req, CancellationToken ct = default);

    Task UnregisterFcmTokenAsync(
        Guid userId, UnregisterTokenRequest req, CancellationToken ct = default);
}
