using FluentValidation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportStock.Api.Auth;
using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.Users;
using SportStock.Api.Exceptions;
using SportStock.Api.Services;

namespace SportStock.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/users")]
public sealed class UsersController(IUserService users) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? role,
        [FromQuery(Name = "is_active")] string? isActive,
        [FromQuery] int page,
        [FromQuery] int limit,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        if (currentUser.ActiveClubId is null)
            throw new AppException("You have not joined a club yet", 404);

        bool? isActiveBool = isActive switch
        {
            null => null,
            "true" => true,
            "false" => false,
            _ => null, // Node's `is_active === 'true'` treats anything else as null
        };

        var result = await users.ListAsync(
            currentUser.ActiveClubId.Value, role, isActiveBool,
            page == 0 ? 1 : page,
            limit == 0 ? 20 : limit, ct);
        return Ok(result);
    }

    [HttpPost]
    [RequireRole(ClubRole.ClubAdmin)]
    public async Task<IActionResult> Create(
        [FromBody] CreateUserRequest body,
        [FromServices] IValidator<CreateUserRequest> validator,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        if (currentUser.ActiveClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var created = await users.CreateAsync(currentUser.ActiveClubId.Value, body, ct);
        return StatusCode(201, created);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(
        Guid id,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        if (currentUser.ActiveClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var user = await users.GetAsync(id, currentUser.ActiveClubId.Value, ct);
        return Ok(user);
    }

    [HttpPut("{id:guid}")]
    [RequireRole(ClubRole.ClubAdmin)]
    public async Task<IActionResult> Update(
        Guid id,
        [FromBody] UpdateUserRequest body,
        [FromServices] IValidator<UpdateUserRequest> validator,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        if (currentUser.ActiveClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var updated = await users.UpdateAsync(id, currentUser.ActiveClubId.Value, body, ct);
        return Ok(updated);
    }

    [HttpDelete("{id:guid}")]
    [RequireRole(ClubRole.ClubAdmin)]
    public async Task<IActionResult> Deactivate(
        Guid id,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        if (currentUser.ActiveClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        await users.DeactivateAsync(id, currentUser.ActiveClubId.Value, currentUser.UserId, ct);
        return NoContent();
    }
}
