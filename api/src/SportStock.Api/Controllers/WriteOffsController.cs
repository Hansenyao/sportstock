using FluentValidation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportStock.Api.Auth;
using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.WriteOffs;
using SportStock.Api.Exceptions;
using SportStock.Api.Services;

namespace SportStock.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/write-offs")]
public sealed class WriteOffsController(IWriteOffService service) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] ListWriteOffsQuery query,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        if (currentUser.ActiveClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var page = await service.ListAsync(currentUser.ActiveClubId.Value, query, ct);
        return Ok(page);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(
        Guid id,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        if (currentUser.ActiveClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var row = await service.GetAsync(id, currentUser.ActiveClubId.Value, ct);
        return Ok(row);
    }

    [HttpPost]
    [RequireRole(ClubRole.ClubAdmin, ClubRole.AssetManager)]
    public async Task<IActionResult> Create(
        [FromBody] CreateWriteOffRequest body,
        [FromServices] IValidator<CreateWriteOffRequest> validator,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        if (currentUser.ActiveClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var created = await service.CreateAsync(
            currentUser.ActiveClubId.Value, currentUser.UserId, body, ct);
        return StatusCode(201, created);
    }
}
