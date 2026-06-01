using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportStock.Api.Auth;
using SportStock.Api.Dtos.Notifications;
using SportStock.Api.Services;

namespace SportStock.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/notifications")]
public sealed class NotificationsController(INotificationService service) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] ListNotificationsQuery query,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        var page = await service.ListAsync(currentUser.UserId, query, ct);
        return Ok(page);
    }

    [HttpPut("read-all")]
    public async Task<IActionResult> MarkAllRead(
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        return Ok(await service.MarkAllReadAsync(currentUser.UserId, ct));
    }

    [HttpPut("{id:guid}/read")]
    public async Task<IActionResult> MarkRead(
        Guid id,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        return Ok(await service.MarkReadAsync(id, currentUser.UserId, ct));
    }

    [HttpPost("fcm-token")]
    public async Task<IActionResult> RegisterToken(
        [FromBody] RegisterTokenRequest body,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        await service.RegisterFcmTokenAsync(currentUser.UserId, body, ct);
        return StatusCode(201, new { message = "FCM token registered" });
    }

    [HttpDelete("fcm-token")]
    public async Task<IActionResult> UnregisterToken(
        [FromBody] UnregisterTokenRequest body,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        await service.UnregisterFcmTokenAsync(currentUser.UserId, body, ct);
        return NoContent();
    }
}
