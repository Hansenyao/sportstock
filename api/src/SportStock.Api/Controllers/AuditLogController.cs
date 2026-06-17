using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportStock.Api.Auth;
using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.AuditLog;
using SportStock.Api.Services;

namespace SportStock.Api.Controllers;

[ApiController]
[Route("api/v1/audit-logs")]
[Authorize]
public sealed class AuditLogController(IAuditLogService svc, ICurrentUser me) : ControllerBase
{
    [HttpGet]
    [RequireRole(ClubRole.ClubAdmin)]
    public async Task<IActionResult> List([FromQuery] AuditLogQuery q)
        => Ok(await svc.ListAsync(q, me.ActiveClubId));
}
