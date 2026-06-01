using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportStock.Api.Auth;
using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.Reports;
using SportStock.Api.Exceptions;
using SportStock.Api.Services;

namespace SportStock.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/reports")]
[RequireRole(UserRole.ClubAdmin, UserRole.AssetManager)]
public sealed class ReportsController(IReportService service) : ControllerBase
{
    [HttpGet("summary")]
    public async Task<IActionResult> Summary(
        [FromServices] ICurrentUser currentUser, CancellationToken ct)
    {
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        return Ok(await service.GetSummaryAsync(currentUser.ClubId.Value, ct));
    }

    [HttpGet("depreciation")]
    public async Task<IActionResult> Depreciation(
        [FromServices] ICurrentUser currentUser, CancellationToken ct)
    {
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        return Ok(await service.GetDepreciationAsync(currentUser.ClubId.Value, ct));
    }

    [HttpGet("loan-usage")]
    public async Task<IActionResult> LoanUsage(
        [FromQuery] LoanUsageQuery query,
        [FromServices] ICurrentUser currentUser, CancellationToken ct)
    {
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        return Ok(await service.GetLoanUsageAsync(currentUser.ClubId.Value, query, ct));
    }

    [HttpGet("movements/recent")]
    public async Task<IActionResult> RecentMovements(
        [FromServices] ICurrentUser currentUser, CancellationToken ct)
    {
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        return Ok(await service.GetRecentMovementsAsync(currentUser.ClubId.Value, ct));
    }

    [HttpGet("movements")]
    public async Task<IActionResult> Movements(
        [FromQuery] MovementsRangeQuery query,
        [FromServices] ICurrentUser currentUser, CancellationToken ct)
    {
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        return Ok(await service.GetMovementsAsync(currentUser.ClubId.Value, query, ct));
    }

    [HttpGet("alerts")]
    public async Task<IActionResult> Alerts(
        [FromServices] ICurrentUser currentUser, CancellationToken ct)
    {
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        return Ok(await service.GetAlertsAsync(currentUser.ClubId.Value, ct));
    }
}
