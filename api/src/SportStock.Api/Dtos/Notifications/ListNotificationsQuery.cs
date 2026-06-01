using Microsoft.AspNetCore.Mvc;

namespace SportStock.Api.Dtos.Notifications;

public sealed class ListNotificationsQuery
{
    // Node accepts is_read=true|false plus the alias unread=true (Node tests
    // exercise the unread alias). We keep both for parity.
    [FromQuery(Name = "is_read")] public string? IsRead { get; set; }
    [FromQuery(Name = "unread")] public string? Unread { get; set; }
    [FromQuery(Name = "page")] public int Page { get; set; } = 1;
    [FromQuery(Name = "limit")] public int Limit { get; set; } = 20;
}
