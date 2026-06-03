using FluentValidation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportStock.Api.Auth;
using SportStock.Api.Data;
using SportStock.Api.Dtos.Auth;
using SportStock.Api.Exceptions;
using SportStock.Api.Integrations;
using SportStock.Api.Services;

namespace SportStock.Api.Controllers;

[ApiController]
[Route("api/v1/auth")]
public sealed class AuthController(IAuthService auth, SportStockDbContext db) : ControllerBase
{
    // ── Public endpoints ─────────────────────────────────────────────────────

    // POST /api/v1/auth/register — create a user account only (no club)
    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> Register([FromBody] RegisterUserRequest req)
    {
        var result = await auth.RegisterUserAsync(req);
        return Ok(result);
    }

    [HttpPost("verify-email")]
    [AllowAnonymous]
    public async Task<IActionResult> VerifyEmail(
        [FromBody] VerifyEmailRequest body,
        [FromServices] IValidator<VerifyEmailRequest> validator,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        await auth.VerifyEmailAsync(body.Email, body.Code);
        return Ok(new { message = "Email verified successfully. You can now log in." });
    }

    [HttpPost("resend-verification")]
    [AllowAnonymous]
    public async Task<IActionResult> ResendVerification(
        [FromBody] ResendVerificationRequest body,
        [FromServices] IValidator<ResendVerificationRequest> validator,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        await auth.SendVerificationCodeAsync(body.Email, VerificationCodeKind.Registration, ct);
        return Ok(new { message = "Verification code resent." });
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login(
        [FromBody] LoginRequest body,
        [FromServices] IValidator<LoginRequest> validator,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        var result = await auth.LoginAsync(body);
        return Ok(result);
    }

    [HttpPost("forgot-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ForgotPassword(
        [FromBody] ForgotPasswordRequest body,
        [FromServices] IValidator<ForgotPasswordRequest> validator,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        await auth.ForgotPasswordAsync(body.Email);
        return Ok(new { message = "If this email is registered, a reset code has been sent." });
    }

    [HttpPost("reset-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ResetPassword(
        [FromBody] ResetPasswordRequest body,
        [FromServices] IValidator<ResetPasswordRequest> validator,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        await auth.ResetPasswordAsync(body);
        return Ok(new { message = "Password reset successful. You can now log in." });
    }

    // ── Authenticated endpoints ──────────────────────────────────────────────

    // POST /api/v1/auth/register-club — authenticated user creates a new club
    [HttpPost("register-club")]
    [Authorize]
    public async Task<IActionResult> RegisterClub(
        [FromBody] RegisterClubRequest req,
        [FromServices] ICurrentUser currentUser)
    {
        var result = await auth.RegisterClubAsync(req, currentUser.UserId);
        return Ok(result);
    }

    // POST /api/v1/auth/select-club — exchange unscoped token for scoped
    [HttpPost("select-club")]
    [Authorize]
    public async Task<IActionResult> SelectClub(
        [FromBody] SelectClubRequest req,
        [FromServices] ICurrentUser currentUser)
    {
        var token = await auth.SelectClubAsync(currentUser.UserId, req.ClubId);
        return Ok(new { token });
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> GetMe([FromServices] ICurrentUser currentUser)
    {
        var result = await auth.GetMeAsync(currentUser.UserId, currentUser.ActiveClubId);
        return Ok(result);
    }

    [HttpPut("password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword(
        [FromBody] ChangePasswordRequest body,
        [FromServices] IValidator<ChangePasswordRequest> validator,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        await auth.ChangePasswordAsync(currentUser.UserId, body.CurrentPassword, body.NewPassword, ct);
        return Ok(new { message = "Password changed successfully." });
    }

    [HttpPut("profile")]
    [Authorize]
    public async Task<IActionResult> UpdateProfile(
        [FromBody] UpdateProfileRequest body,
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        var user = await db.Users.FindAsync(new object[] { currentUser.UserId }, ct)
            ?? throw new AppException("User not found", 404);
        if (body.FirstName is not null) user.FirstName = body.FirstName;
        if (body.LastName is not null) user.LastName = body.LastName;
        user.Phone = body.Phone;
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(new { message = "Profile updated." });
    }
}
