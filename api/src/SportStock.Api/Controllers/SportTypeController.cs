using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportStock.Api.Dtos.SportType;
using SportStock.Api.Services;

namespace SportStock.Api.Controllers;

[ApiController]
public sealed class SportTypeController(ISportTypeService svc) : ControllerBase
{
    // Public endpoint — used by registration dropdown
    [HttpGet("api/v1/sport-types")]
    [AllowAnonymous]
    public async Task<IActionResult> ListActive()
        => Ok(await svc.ListActiveAsync());
}
