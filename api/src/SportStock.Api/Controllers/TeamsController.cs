using FluentValidation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportStock.Api.Auth;
using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.Teams;
using SportStock.Api.Exceptions;
using SportStock.Api.Services;

namespace SportStock.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/teams")]
public sealed class TeamsController(ITeamService teams) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var rows = await teams.ListAsync(currentUser.ClubId.Value, ct);
        return Ok(rows);
    }

    [HttpPost]
    [RequireRole(UserRole.ClubAdmin)]
    public async Task<IActionResult> Create(
        [FromBody] CreateTeamRequest body,
        [FromServices] IValidator<CreateTeamRequest> validator,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var team = await teams.CreateAsync(currentUser.ClubId.Value, body, ct);
        return StatusCode(201, team);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(
        Guid id,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var team = await teams.GetAsync(id, currentUser.ClubId.Value, ct);
        return Ok(team);
    }

    [HttpPut("{id:guid}")]
    [RequireRole(UserRole.ClubAdmin)]
    public async Task<IActionResult> Update(
        Guid id,
        [FromBody] UpdateTeamRequest body,
        [FromServices] IValidator<UpdateTeamRequest> validator,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var team = await teams.UpdateAsync(id, currentUser.ClubId.Value, body, ct);
        return Ok(team);
    }

    [HttpDelete("{id:guid}")]
    [RequireRole(UserRole.ClubAdmin)]
    public async Task<IActionResult> Delete(
        Guid id,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        await teams.DeleteAsync(id, currentUser.ClubId.Value, ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/members")]
    [RequireRole(UserRole.ClubAdmin)]
    public async Task<IActionResult> AddMember(
        Guid id,
        [FromBody] AddTeamMemberRequest body,
        [FromServices] IValidator<AddTeamMemberRequest> validator,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var member = await teams.AddMemberAsync(id, currentUser.ClubId.Value, body.UserId, body.TeamRole, ct);
        return StatusCode(201, member);
    }

    [HttpPut("{id:guid}/members/{userId:guid}")]
    [RequireRole(UserRole.ClubAdmin)]
    public async Task<IActionResult> UpdateMember(
        Guid id,
        Guid userId,
        [FromBody] UpdateTeamMemberRequest body,
        [FromServices] IValidator<UpdateTeamMemberRequest> validator,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var member = await teams.UpdateMemberRoleAsync(id, currentUser.ClubId.Value, userId, body.TeamRole, ct);
        return Ok(member);
    }

    [HttpDelete("{id:guid}/members/{userId:guid}")]
    [RequireRole(UserRole.ClubAdmin)]
    public async Task<IActionResult> RemoveMember(
        Guid id,
        Guid userId,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        await teams.RemoveMemberAsync(id, currentUser.ClubId.Value, userId, ct);
        return NoContent();
    }
}
