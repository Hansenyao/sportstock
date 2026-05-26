using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportStock.Api.Auth;
using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.Admin;
using SportStock.Api.Exceptions;
using SportStock.Api.Services;

namespace SportStock.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/admin")]
[RequireRole(UserRole.SuperAdmin)]
public sealed class AdminController(IAdminService service) : ControllerBase
{
    [HttpGet("stats")]
    public async Task<IActionResult> Stats(CancellationToken ct) =>
        Ok(await service.GetPlatformStatsAsync(ct));

    [HttpGet("analytics/overview")]
    public async Task<IActionResult> AnalyticsOverview(
        [FromQuery] AnalyticsClubFilterQuery query, CancellationToken ct) =>
        Ok(await service.GetAnalyticsOverviewAsync(query.ClubId, ct));

    [HttpGet("analytics/loans")]
    public async Task<IActionResult> AnalyticsLoans(
        [FromQuery] AnalyticsClubFilterQuery query, CancellationToken ct) =>
        Ok(await service.GetAnalyticsLoansAsync(query.ClubId, ct));

    [HttpGet("analytics/assets")]
    public async Task<IActionResult> AnalyticsAssets(
        [FromQuery] AnalyticsClubFilterQuery query, CancellationToken ct) =>
        Ok(await service.GetAnalyticsAssetsAsync(query.ClubId, ct));

    [HttpGet("analytics/growth")]
    public async Task<IActionResult> AnalyticsGrowth(CancellationToken ct) =>
        Ok(await service.GetAnalyticsGrowthAsync(ct));

    [HttpGet("clubs")]
    public async Task<IActionResult> ListClubs(
        [FromQuery] ListClubsQuery query, CancellationToken ct) =>
        Ok(await service.ListClubsAsync(query, ct));

    [HttpGet("clubs/{id:guid}")]
    public async Task<IActionResult> GetClub(Guid id, CancellationToken ct) =>
        Ok(await service.GetClubAsync(id, ct));

    [HttpPatch("clubs/{id:guid}/status")]
    public async Task<IActionResult> UpdateClubStatus(
        Guid id, [FromBody] UpdateActiveRequest body, CancellationToken ct)
    {
        if (body.IsActive is null) throw new AppException("is_active must be a boolean", 400);
        await service.UpdateClubStatusAsync(id, body.IsActive.Value, ct);
        return Ok(new StatusMessageResponse { Message = "Club status updated" });
    }

    [HttpPost("clubs/{id:guid}/reset-admin-password")]
    public async Task<IActionResult> ResetClubAdmin(Guid id, CancellationToken ct)
    {
        var temp = await service.ResetClubAdminPasswordAsync(id, ct);
        return Ok(new TempPasswordResponse { TempPassword = temp });
    }

    [HttpGet("clubs/{id:guid}/users")]
    public async Task<IActionResult> ListClubUsers(
        Guid id, [FromQuery] int page, [FromQuery] int limit, CancellationToken ct) =>
        Ok(await service.ListClubUsersAsync(id, page == 0 ? 1 : page, limit == 0 ? 20 : limit, ct));

    [HttpPatch("clubs/{id:guid}/users/{uid:guid}/status")]
    public async Task<IActionResult> UpdateUserStatus(
        Guid id, Guid uid, [FromBody] UpdateActiveRequest body, CancellationToken ct)
    {
        if (body.IsActive is null) throw new AppException("is_active must be a boolean", 400);
        await service.UpdateUserStatusAsync(id, uid, body.IsActive.Value, ct);
        return Ok(new StatusMessageResponse { Message = "User status updated" });
    }

    [HttpPost("clubs/{id:guid}/users/{uid:guid}/reset-password")]
    public async Task<IActionResult> ResetUserPassword(Guid id, Guid uid, CancellationToken ct)
    {
        var temp = await service.ResetUserPasswordAsync(id, uid, ct);
        return Ok(new TempPasswordResponse { TempPassword = temp });
    }

    [HttpGet("clubs/{id:guid}/assets")]
    public async Task<IActionResult> ListClubAssets(
        Guid id, [FromQuery] ListClubResourcesQuery query, CancellationToken ct) =>
        Ok(await service.ListClubAssetsAsync(id, query, ct));

    [HttpPatch("clubs/{id:guid}/assets/{aid:guid}/status")]
    public async Task<IActionResult> UpdateAssetStatus(
        Guid id, Guid aid, [FromBody] UpdateActiveRequest body, CancellationToken ct)
    {
        if (body.IsActive is null) throw new AppException("is_active must be a boolean", 400);
        await service.UpdateAssetStatusAsync(id, aid, body.IsActive.Value, ct);
        var msg = body.IsActive.Value ? "Asset enabled" : "Asset disabled";
        return Ok(new StatusMessageResponse { Message = msg });
    }

    [HttpDelete("clubs/{id:guid}/assets/{aid:guid}")]
    public async Task<IActionResult> DeleteAsset(Guid id, Guid aid, CancellationToken ct)
    {
        await service.DeleteAssetAsync(id, aid, ct);
        return Ok(new StatusMessageResponse { Message = "Asset deleted" });
    }

    [HttpGet("clubs/{id:guid}/loans")]
    public async Task<IActionResult> ListClubLoans(
        Guid id,
        [FromQuery] int page,
        [FromQuery] int limit,
        [FromQuery] string? status,
        CancellationToken ct) =>
        Ok(await service.ListClubLoansAsync(id, page == 0 ? 1 : page, limit == 0 ? 20 : limit, status, ct));
}
