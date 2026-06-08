using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportStock.Api.Auth;
using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.Membership;
using SportStock.Api.Services;

namespace SportStock.Api.Controllers;

[ApiController]
[Authorize]
public sealed class MembershipController(IMembershipService svc, ICurrentUser me) : ControllerBase
{
    [HttpGet("api/v1/clubs/{clubId:guid}/invitations")]
    [RequireRole(ClubRole.ClubAdmin)]
    public async Task<IActionResult> ListInvitations(Guid clubId)
        => Ok(await svc.ListClubInvitationsAsync(clubId));

    [HttpPost("api/v1/clubs/{clubId:guid}/invitations")]
    [RequireRole(ClubRole.ClubAdmin)]
    public async Task<IActionResult> Invite(Guid clubId, [FromBody] InviteUserRequest req)
    {
        var result = await svc.InviteUserAsync(clubId, me.UserId, req);
        return StatusCode(201, result);
    }

    [HttpPost("api/v1/clubs/{clubId:guid}/invitations/{invitationId:guid}/accept")]
    public async Task<IActionResult> Accept(Guid clubId, Guid invitationId)
    {
        var result = await svc.AcceptInvitationAsync(clubId, invitationId, me.UserId);
        return Ok(result);
    }

    [HttpPost("api/v1/clubs/{clubId:guid}/invitations/{invitationId:guid}/decline")]
    public async Task<IActionResult> Decline(Guid clubId, Guid invitationId)
    {
        await svc.DeclineInvitationAsync(clubId, invitationId, me.UserId);
        return NoContent();
    }

    [HttpDelete("api/v1/clubs/{clubId:guid}/invitations/{invitationId:guid}")]
    [RequireRole(ClubRole.ClubAdmin)]
    public async Task<IActionResult> Cancel(Guid clubId, Guid invitationId)
    {
        await svc.CancelInvitationAsync(clubId, invitationId, me.UserId);
        return NoContent();
    }
}

[ApiController]
[Route("api/v1/clubs/{clubId:guid}/members")]
[Authorize]
public sealed class ClubMembersController(IMembershipService svc, ICurrentUser me) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(Guid clubId)
        => Ok(await svc.ListMembersAsync(clubId));

    [HttpGet("search")]
    [RequireRole(ClubRole.ClubAdmin)]
    public async Task<IActionResult> Search(Guid clubId, [FromQuery] string q)
        => Ok(await svc.SearchUsersAsync(clubId, q));

    [HttpPut("{userId:guid}/role")]
    [RequireRole(ClubRole.ClubAdmin)]
    public async Task<IActionResult> UpdateRole(Guid clubId, Guid userId, [FromBody] UpdateRoleRequest req)
    {
        await svc.UpdateMemberRoleAsync(clubId, userId, req.Role, me.UserId);
        return NoContent();
    }

    [HttpDelete("{userId:guid}")]
    [RequireRole(ClubRole.ClubAdmin)]
    public async Task<IActionResult> Remove(Guid clubId, Guid userId)
    {
        await svc.DeactivateMemberAsync(clubId, userId, me.UserId);
        return NoContent();
    }
}
