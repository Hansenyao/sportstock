using FluentValidation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportStock.Api.Auth;
using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.Loans;
using SportStock.Api.Exceptions;
using SportStock.Api.Services;

namespace SportStock.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/loans")]
public sealed class LoansController(ILoanService service) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] ListLoansQuery query,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var page = await service.ListAsync(
            currentUser.ClubId.Value, currentUser.UserId, currentUser.Role, query, ct);
        return Ok(page);
    }

    [HttpPost]
    public async Task<IActionResult> Create(
        [FromBody] CreateLoanRequest body,
        [FromServices] IValidator<CreateLoanRequest> validator,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var loan = await service.CreateAsync(
            currentUser.ClubId.Value, currentUser.UserId, currentUser.Role, body, ct);
        return StatusCode(201, loan);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(
        Guid id,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var loan = await service.GetAsync(
            id, currentUser.ClubId.Value, currentUser.UserId, currentUser.Role, ct);
        return Ok(loan);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(
        Guid id,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        await service.DeleteAsync(
            id, currentUser.ClubId.Value, currentUser.UserId, currentUser.Role, ct);
        return NoContent();
    }

    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> Update(
        Guid id,
        [FromBody] UpdateLoanRequest body,
        [FromServices] IValidator<UpdateLoanRequest> validator,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var loan = await service.UpdateAsync(
            id, currentUser.ClubId.Value, currentUser.UserId, currentUser.Role, body, ct);
        return Ok(loan);
    }

    [HttpPost("{id:guid}/approve")]
    [RequireRole(UserRole.ClubAdmin, UserRole.AssetManager)]
    public async Task<IActionResult> Approve(
        Guid id,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var loan = await service.ApproveAsync(id, currentUser.UserId, currentUser.ClubId.Value, ct);
        return Ok(loan);
    }

    [HttpPost("{id:guid}/reject")]
    [RequireRole(UserRole.ClubAdmin, UserRole.AssetManager)]
    public async Task<IActionResult> Reject(
        Guid id,
        [FromBody] RejectLoanRequest body,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var loan = await service.RejectAsync(
            id, currentUser.UserId, currentUser.ClubId.Value, body.Reason, ct);
        return Ok(loan);
    }

    [HttpPost("{id:guid}/checkout")]
    [RequireRole(UserRole.Coach, UserRole.ClubAdmin, UserRole.AssetManager)]
    public async Task<IActionResult> Checkout(
        Guid id,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var loan = await service.CheckoutAsync(id, currentUser.UserId, currentUser.ClubId.Value, ct);
        return Ok(loan);
    }

    [HttpPost("{id:guid}/return")]
    [RequireRole(UserRole.ClubAdmin, UserRole.AssetManager)]
    public async Task<IActionResult> ConfirmReturn(
        Guid id,
        [FromBody] ReturnLoanRequest body,
        [FromServices] IValidator<ReturnLoanRequest> validator,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        if (currentUser.ClubId is null)
            throw new AppException("You have not joined a club yet", 404);
        var loan = await service.ConfirmReturnAsync(
            id, currentUser.UserId, currentUser.ClubId.Value, body, ct);
        return Ok(loan);
    }
}
