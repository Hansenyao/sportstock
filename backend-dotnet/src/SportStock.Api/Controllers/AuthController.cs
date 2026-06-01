using FluentValidation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportStock.Api.Auth;
using SportStock.Api.Dtos.Auth;
using SportStock.Api.Exceptions;
using SportStock.Api.Integrations;
using SportStock.Api.Services;

namespace SportStock.Api.Controllers;

[ApiController]
[Route("api/v1/auth")]
public sealed class AuthController(IAuthService auth) : ControllerBase
{
    // ── Public endpoints ─────────────────────────────────────────────────────

    [HttpPost("register")]
    public async Task<IActionResult> Register(
        [FromBody] RegisterRequest body,
        [FromServices] IValidator<RegisterRequest> validator,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        await auth.RegisterAsync(body, ct);
        return StatusCode(201, new
        {
            message = "Registration successful. Please check your email for the verification code.",
        });
    }

    [HttpPost("verify-email")]
    public async Task<IActionResult> VerifyEmail(
        [FromBody] VerifyEmailRequest body,
        [FromServices] IValidator<VerifyEmailRequest> validator,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        await auth.VerifyEmailAsync(body.Email, body.Code, ct);
        return Ok(new { message = "Email verified successfully. You can now log in." });
    }

    [HttpPost("resend-verification")]
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
    public async Task<IActionResult> Login(
        [FromBody] LoginRequest body,
        [FromServices] IValidator<LoginRequest> validator,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        var result = await auth.LoginAsync(body.Email, body.Password, ct);
        return Ok(result);
    }

    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword(
        [FromBody] ForgotPasswordRequest body,
        [FromServices] IValidator<ForgotPasswordRequest> validator,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        await auth.ForgotPasswordAsync(body.Email, ct);
        return Ok(new { message = "If this email is registered, a reset code has been sent." });
    }

    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword(
        [FromBody] ResetPasswordRequest body,
        [FromServices] IValidator<ResetPasswordRequest> validator,
        CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(body, ct);
        await auth.ResetPasswordAsync(body.Email, body.Code, body.NewPassword, ct);
        return Ok(new { message = "Password reset successful. You can now log in." });
    }

    // ── Authenticated endpoints ──────────────────────────────────────────────

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> GetMe(
        [FromServices] ICurrentUser currentUser,
        CancellationToken ct)
    {
        var profile = await auth.GetProfileAsync(currentUser.UserId, ct);
        if (profile is null) throw new AppException("User not found", 404);
        return Ok(profile);
    }

    [Authorize]
    [HttpPut("password")]
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
}
