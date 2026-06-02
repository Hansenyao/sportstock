using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportStock.Api.Auth;
using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.Kit;
using SportStock.Api.Services;

namespace SportStock.Api.Controllers;

[ApiController]
[Route("api/v1/kits")]
[Authorize]
public sealed class KitController(IKitService svc, ICurrentUser me) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List()
        => Ok(await svc.ListAsync(me.ActiveClubId!.Value));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
        => Ok(await svc.GetAsync(id, me.ActiveClubId!.Value));

    [HttpPost]
    [RequireRole(ClubRole.ClubAdmin, ClubRole.AssetManager)]
    public async Task<IActionResult> Create([FromBody] CreateKitRequest req)
        => StatusCode(201, await svc.CreateAsync(me.ActiveClubId!.Value, me.UserId, req));

    [HttpPut("{id:guid}")]
    [RequireRole(ClubRole.ClubAdmin, ClubRole.AssetManager)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateKitRequest req)
    {
        await svc.UpdateAsync(id, me.ActiveClubId!.Value, req);
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [RequireRole(ClubRole.ClubAdmin, ClubRole.AssetManager)]
    public async Task<IActionResult> Delete(Guid id)
    {
        await svc.DeleteAsync(id, me.ActiveClubId!.Value);
        return NoContent();
    }

    [HttpPost("{id:guid}/items")]
    [RequireRole(ClubRole.ClubAdmin, ClubRole.AssetManager)]
    public async Task<IActionResult> AddItem(Guid id, [FromBody] AddKitItemRequest req)
        => StatusCode(201, await svc.AddItemAsync(id, me.ActiveClubId!.Value, req));

    [HttpPut("{id:guid}/items/{itemId:guid}")]
    [RequireRole(ClubRole.ClubAdmin, ClubRole.AssetManager)]
    public async Task<IActionResult> UpdateItem(Guid id, Guid itemId, [FromBody] UpdateKitItemRequest req)
        => Ok(await svc.UpdateItemAsync(id, itemId, me.ActiveClubId!.Value, req));

    [HttpDelete("{id:guid}/items/{itemId:guid}")]
    [RequireRole(ClubRole.ClubAdmin, ClubRole.AssetManager)]
    public async Task<IActionResult> RemoveItem(Guid id, Guid itemId)
    {
        await svc.RemoveItemAsync(id, itemId, me.ActiveClubId!.Value);
        return NoContent();
    }
}
