using FluentValidation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportStock.Api.Auth;
using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.Clubs;
using SportStock.Api.Exceptions;
using SportStock.Api.Services;

namespace SportStock.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/clubs")]
public sealed class ClubsController(IClubService clubs) : ControllerBase
{
    [HttpGet("me")]
    public async Task<IActionResult> GetMine(
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var club = await clubs.GetAsync(currentUser.ClubId.Value, ct);
        return Ok(club);
    }

    [HttpPut("me")]
    [RequireRole(UserRole.ClubAdmin)]
    public async Task<IActionResult> UpdateMine(
        [FromBody] UpdateClubRequest body,
        [FromServices] IValidator<UpdateClubRequest> validator,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var club = await clubs.UpdateAsync(currentUser.ClubId.Value, body, ct);
        return Ok(club);
    }

    [HttpPut("me/logo")]
    [RequireRole(UserRole.ClubAdmin)]
    [RequestSizeLimit(5 * 1024 * 1024)]
    public async Task<IActionResult> UploadLogo(
        IFormFile? logo,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        if (logo is null || logo.Length == 0)
            throw new AppException("No file provided", 400);
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);

        await using var stream = logo.OpenReadStream();
        var result = await clubs.UpdateLogoAsync(
            currentUser.ClubId.Value, stream, logo.ContentType, logo.FileName, ct);
        return Ok(result);
    }
}
