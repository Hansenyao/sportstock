using FluentValidation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportStock.Api.Auth;
using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.AssetNames;
using SportStock.Api.Exceptions;
using SportStock.Api.Services;

namespace SportStock.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/asset-names")]
public sealed class AssetNamesController(IAssetNameService service) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        if (currentUser.ActiveClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var rows = await service.ListAsync(currentUser.ActiveClubId.Value, ct);
        return Ok(rows);
    }

    [HttpPost]
    [RequireRole(ClubRole.ClubAdmin, ClubRole.AssetManager)]
    public async Task<IActionResult> Create(
        [FromBody] CreateAssetNameRequest body,
        [FromServices] IValidator<CreateAssetNameRequest> validator,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        if (currentUser.ActiveClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var created = await service.CreateAsync(currentUser.ActiveClubId.Value, body, ct);
        return StatusCode(201, created);
    }

    [HttpPut("{id:guid}")]
    [RequireRole(ClubRole.ClubAdmin, ClubRole.AssetManager)]
    public async Task<IActionResult> Update(
        Guid id,
        [FromBody] UpdateAssetNameRequest body,
        [FromServices] IValidator<UpdateAssetNameRequest> validator,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        if (currentUser.ActiveClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var updated = await service.UpdateAsync(id, currentUser.ActiveClubId.Value, body, ct);
        return Ok(updated);
    }

    [HttpDelete("{id:guid}")]
    [RequireRole(ClubRole.ClubAdmin, ClubRole.AssetManager)]
    public async Task<IActionResult> Delete(
        Guid id,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        if (currentUser.ActiveClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        await service.DeleteAsync(id, currentUser.ActiveClubId.Value, ct);
        return NoContent();
    }
}
