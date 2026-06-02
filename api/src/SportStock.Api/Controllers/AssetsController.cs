using FluentValidation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportStock.Api.Auth;
using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.Assets;
using SportStock.Api.Exceptions;
using SportStock.Api.Services;

namespace SportStock.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/assets")]
public sealed class AssetsController(IAssetService service) : ControllerBase
{
    // ── Categories ───────────────────────────────────────────────────────────

    [HttpGet("categories")]
    public async Task<IActionResult> ListCategories(
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var rows = await service.ListCategoriesAsync(currentUser.ClubId.Value, ct);
        return Ok(rows);
    }

    [HttpPost("categories")]
    [RequireRole(UserRole.ClubAdmin, UserRole.AssetManager)]
    public async Task<IActionResult> CreateCategory(
        [FromBody] CreateCategoryRequest body,
        [FromServices] IValidator<CreateCategoryRequest> validator,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var created = await service.CreateCategoryAsync(currentUser.ClubId.Value, body, ct);
        return StatusCode(201, created);
    }

    // ── Assets (list / get / create / update / delete) ───────────────────────

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] ListAssetsQuery query,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var page = await service.ListAsync(currentUser.ClubId.Value, query, ct);
        return Ok(page);
    }

    [HttpPost]
    [RequireRole(UserRole.ClubAdmin, UserRole.AssetManager)]
    public async Task<IActionResult> Create(
        [FromBody] CreateAssetRequest body,
        [FromServices] IValidator<CreateAssetRequest> validator,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var created = await service.CreateAsync(
            currentUser.ClubId.Value, currentUser.UserId, body, ct);
        return StatusCode(201, created);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(
        Guid id,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var asset = await service.GetAsync(id, currentUser.ClubId.Value, ct);
        return Ok(asset);
    }

    [HttpPut("{id:guid}")]
    [RequireRole(UserRole.ClubAdmin, UserRole.AssetManager)]
    public async Task<IActionResult> Update(
        Guid id,
        [FromBody] UpdateAssetRequest body,
        [FromServices] IValidator<UpdateAssetRequest> validator,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var updated = await service.UpdateAsync(id, currentUser.ClubId.Value, body, ct);
        return Ok(updated);
    }

    [HttpDelete("{id:guid}")]
    [RequireRole(UserRole.ClubAdmin, UserRole.AssetManager)]
    public async Task<IActionResult> Delete(
        Guid id,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        await service.DeleteAsync(id, currentUser.ClubId.Value, ct);
        return NoContent();
    }

    [HttpPut("{id:guid}/image")]
    [RequireRole(UserRole.ClubAdmin, UserRole.AssetManager)]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<IActionResult> UploadImage(
        Guid id,
        IFormFile? image,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        if (image is null || image.Length == 0)
            throw new AppException("No file provided", 400);
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);

        await using var stream = image.OpenReadStream();
        var result = await service.UploadImageAsync(
            id, currentUser.ClubId.Value, stream, image.ContentType, image.FileName, ct);
        return Ok(result);
    }

    // ── Batches ──────────────────────────────────────────────────────────────

    [HttpPost("{id:guid}/batches")]
    [RequireRole(UserRole.ClubAdmin, UserRole.AssetManager)]
    public async Task<IActionResult> AddBatch(
        Guid id,
        [FromBody] CreateBatchRequest body,
        [FromServices] IValidator<CreateBatchRequest> validator,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var result = await service.AddBatchAsync(
            id, currentUser.ClubId.Value, currentUser.UserId, body, ct);
        return StatusCode(201, result);
    }

    [HttpPut("{id:guid}/batches/{batchId:guid}")]
    [RequireRole(UserRole.ClubAdmin, UserRole.AssetManager)]
    public async Task<IActionResult> UpdateBatch(
        Guid id,
        Guid batchId,
        [FromBody] UpdateBatchRequest body,
        [FromServices] IValidator<UpdateBatchRequest> validator,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var result = await service.UpdateBatchAsync(
            batchId, id, currentUser.ClubId.Value, body, ct);
        return Ok(result);
    }

    [HttpGet("{id:guid}/batches/{batchId:guid}/depreciation")]
    [RequireRole(UserRole.ClubAdmin, UserRole.AssetManager)]
    public async Task<IActionResult> GetDepreciation(
        Guid id,
        Guid batchId,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var data = await service.GetDepreciationAsync(batchId, currentUser.ClubId.Value, ct);
        return Ok(data);
    }

    // ── Item-level endpoints (v2) ────────────────────────────────────────────

    [HttpGet("{typeId:guid}/items")]
    public async Task<IActionResult> ListItems(
        Guid typeId,
        [FromServices] ICurrentUser currentUser)
    {
        if (currentUser.ActiveClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        return Ok(await service.ListItemsAsync(typeId, currentUser.ActiveClubId.Value));
    }

    [HttpPost("{typeId:guid}/items")]
    [RequireRole(ClubRole.ClubAdmin, ClubRole.AssetManager)]
    public async Task<IActionResult> AddItem(
        Guid typeId,
        [FromBody] AddAssetItemRequest req,
        [FromServices] ICurrentUser currentUser)
    {
        if (currentUser.ActiveClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        return StatusCode(201, await service.AddItemAsync(typeId, req, currentUser.ActiveClubId.Value));
    }

    [HttpPut("items/{itemId:guid}")]
    [RequireRole(ClubRole.ClubAdmin, ClubRole.AssetManager)]
    public async Task<IActionResult> UpdateItem(
        Guid itemId,
        [FromBody] UpdateAssetItemRequest req,
        [FromServices] ICurrentUser currentUser)
    {
        if (currentUser.ActiveClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        return Ok(await service.UpdateItemAsync(itemId, req, currentUser.ActiveClubId.Value));
    }

    [HttpPost("{typeId:guid}/items/retire")]
    [RequireRole(ClubRole.ClubAdmin, ClubRole.AssetManager)]
    public async Task<IActionResult> RetireByQuantity(
        Guid typeId,
        [FromBody] RetireByQuantityRequest req,
        [FromServices] ICurrentUser currentUser)
    {
        if (currentUser.ActiveClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        await service.RetireItemsByQuantityAsync(typeId, req.Quantity, req.Notes, currentUser.ActiveClubId.Value);
        return NoContent();
    }

    [HttpPost("items/{itemId:guid}/retire")]
    [RequireRole(ClubRole.ClubAdmin, ClubRole.AssetManager)]
    public async Task<IActionResult> RetireItem(
        Guid itemId,
        [FromServices] ICurrentUser currentUser)
    {
        if (currentUser.ActiveClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        await service.RetireItemAsync(itemId, currentUser.ActiveClubId.Value);
        return NoContent();
    }

    [HttpPost("{typeId:guid}/items/write-off")]
    [RequireRole(ClubRole.ClubAdmin, ClubRole.AssetManager)]
    public async Task<IActionResult> WriteOffByQuantity(
        Guid typeId,
        [FromBody] WriteOffByQuantityRequest req,
        [FromServices] ICurrentUser currentUser)
    {
        if (currentUser.ActiveClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        await service.WriteOffItemsByQuantityAsync(typeId, req.Quantity, req.Reason, currentUser.ActiveClubId.Value);
        return NoContent();
    }

    [HttpPost("items/{itemId:guid}/write-off")]
    [RequireRole(ClubRole.ClubAdmin, ClubRole.AssetManager)]
    public async Task<IActionResult> WriteOffItem(
        Guid itemId,
        [FromBody] WriteOffItemRequest req,
        [FromServices] ICurrentUser currentUser)
    {
        if (currentUser.ActiveClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        await service.WriteOffItemAsync(itemId, req.Reason, currentUser.ActiveClubId.Value);
        return NoContent();
    }
}
