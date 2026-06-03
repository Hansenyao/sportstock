using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportStock.Api.Auth;
using SportStock.Api.Data;
using SportStock.Api.Dtos.Membership;

namespace SportStock.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/invitations")]
public sealed class InvitationsController(SportStockDbContext db) : ControllerBase
{
    [HttpGet("mine")]
    public async Task<IActionResult> GetMine([FromServices] ICurrentUser currentUser, CancellationToken ct)
    {
        var invitations = await db.ClubInvitations
            .Include(i => i.Club)
            .Include(i => i.InvitedBy)
            .Where(i => i.InviteeId == currentUser.UserId && i.Status == "pending")
            .OrderByDescending(i => i.CreatedAt)
            .Select(i => new PendingInvitationDto(
                i.Id,
                i.ClubId,
                i.Club.Name,
                i.InvitedById,
                i.InvitedBy.FirstName + " " + i.InvitedBy.LastName,
                i.Role,
                i.CreatedAt))
            .ToListAsync(ct);

        return Ok(new { data = invitations, total = invitations.Count });
    }
}
