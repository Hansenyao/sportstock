using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportStock.Api.Auth;
using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.Warehouse;
using SportStock.Api.Services;

namespace SportStock.Api.Controllers;

[ApiController]
[Route("api/v1/warehouses")]
[Authorize]
public sealed class WarehouseController(IWarehouseService svc, ICurrentUser me) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List()
        => Ok(await svc.ListAsync(me.ActiveClubId!.Value));

    [HttpPost]
    [RequireRole(ClubRole.ClubAdmin, ClubRole.AssetManager)]
    public async Task<IActionResult> Create([FromBody] CreateWarehouseRequest req)
        => StatusCode(201, await svc.CreateAsync(me.ActiveClubId!.Value, req));

    [HttpPut("{id:guid}")]
    [RequireRole(ClubRole.ClubAdmin, ClubRole.AssetManager)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateWarehouseRequest req)
    {
        await svc.UpdateAsync(me.ActiveClubId!.Value, id, req);
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [RequireRole(ClubRole.ClubAdmin)]
    public async Task<IActionResult> Delete(Guid id)
    {
        await svc.DeleteAsync(me.ActiveClubId!.Value, id);
        return NoContent();
    }
}
