using FluentValidation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportStock.Api.Auth;
using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.Inventory;
using SportStock.Api.Exceptions;
using SportStock.Api.Services;

namespace SportStock.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/inventory")]
[RequireRole(ClubRole.ClubAdmin, ClubRole.AssetManager)]
public sealed class InventoryController(IInventoryService service) : ControllerBase
{
    [HttpGet("movements")]
    public async Task<IActionResult> ListMovements(
        [FromQuery] ListMovementsQuery query,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var page = await service.ListMovementsAsync(currentUser.ClubId.Value, query, ct);
        return Ok(page);
    }

    [HttpPost("batches/{batchId:guid}/adjust")]
    public async Task<IActionResult> Adjust(
        Guid batchId,
        [FromBody] AdjustBatchRequest body,
        [FromServices] IValidator<AdjustBatchRequest> validator,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var batch = await service.AdjustBatchAsync(
            currentUser.ClubId.Value, currentUser.UserId, batchId, body, ct);
        return Ok(batch);
    }

    [HttpPost("batches/{batchId:guid}/retire")]
    public async Task<IActionResult> Retire(
        Guid batchId,
        [FromBody] RetireBatchRequest body,
        [FromServices] IValidator<RetireBatchRequest> validator,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var batch = await service.RetireBatchAsync(
            currentUser.ClubId.Value, currentUser.UserId, batchId, body, ct);
        return Ok(batch);
    }

    [HttpPost("batches/{batchId:guid}/maintenance")]
    public async Task<IActionResult> Maintenance(
        Guid batchId,
        [FromBody] MaintenanceBatchRequest body,
        [FromServices] IValidator<MaintenanceBatchRequest> validator,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var batch = await service.CompleteMaintenanceAsync(
            currentUser.ClubId.Value, currentUser.UserId, batchId, body, ct);
        return Ok(batch);
    }

    [HttpGet("stocktake")]
    public async Task<IActionResult> ListStocktakes(
        [FromQuery] int page,
        [FromQuery] int limit,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var rows = await service.ListStocktakesAsync(
            currentUser.ClubId.Value, page == 0 ? 1 : page, limit == 0 ? 10 : limit, ct);
        return Ok(rows);
    }

    [HttpPost("stocktake")]
    public async Task<IActionResult> CreateStocktake(
        [FromBody] CreateStocktakeRequest body,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var created = await service.CreateStocktakeAsync(
            currentUser.ClubId.Value, currentUser.UserId, body, ct);
        return StatusCode(201, created);
    }

    [HttpGet("stocktake/{id:guid}")]
    public async Task<IActionResult> GetStocktake(
        Guid id,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var detail = await service.GetStocktakeAsync(id, currentUser.ClubId.Value, ct);
        return Ok(detail);
    }

    [HttpPut("stocktake/{id:guid}")]
    public async Task<IActionResult> UpdateStocktake(
        Guid id,
        [FromBody] UpdateStocktakeRequest body,
        [FromServices] IValidator<UpdateStocktakeRequest> validator,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var updated = await service.UpdateStocktakeAsync(id, currentUser.ClubId.Value, body, ct);
        return Ok(updated);
    }
}
