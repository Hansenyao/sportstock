using System.Security.Claims;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using SportStock.Api.Configuration;
using SportStock.Api.Data;
using SportStock.Api.Data.Entities;
using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.Auth;
using SportStock.Api.Exceptions;
using SportStock.Api.Integrations;

namespace SportStock.Api.Services;

// Ports backend/src/services/auth.service.ts 1:1. Behavior parity is
// required for the frontend to switch base URL with zero code changes.
//
// Notable preserved-from-Node quirks:
//   - GenerateCode returns the literal "123456" (no real random until
//     Resend is wired). See // TODO comments below.
//   - email is always lowercased before storage / lookup.
//   - forgot-password is silent when the email is unknown to avoid
//     enumeration; it always returns 200 from the controller.
//   - login emits a single 401 for "wrong email or password" — no
//     distinction between the two on the wire.
internal sealed class AuthService(
    SportStockDbContext db,
    IEmailSender emailSender,
    IOptions<JwtOptions> jwtOptions,
    ILogger<AuthService> log) : IAuthService
{
    private const int SaltRounds = 10;
    private const int CodeExpiryMinutes = 15;

    // TODO: restore real code generation before production
    private static string GenerateCode() => "123456";

    public async Task RegisterAsync(RegisterRequest req, CancellationToken ct = default)
    {
        var emailNormalized = req.User.Email.Trim().ToLowerInvariant();
        var clubName = req.Club.Name.Trim();

        // Uniqueness checks throw 409 directly so the validator can stay
        // strictly a 400 emitter (see RegisterRequestValidator).
        var emailExists = await db.Users
            .IgnoreQueryFilters()
            .AnyAsync(u => u.Email == emailNormalized, ct);
        if (emailExists)
            throw new AppException("This email is already registered", 409);

        var clubExists = await db.Clubs
            .IgnoreQueryFilters()
            .AnyAsync(c => c.Name.ToLower() == clubName.ToLower(), ct);
        if (clubExists)
            throw new AppException("A club with this name already exists", 409);

        var passwordHash = BCrypt.Net.BCrypt.HashPassword(req.User.Password, SaltRounds);

        // Pre-generate the Club.Id client-side so we can wire ClubId on the
        // User row in the same SaveChanges roundtrip (otherwise we would
        // need two roundtrips to read the DB-generated UUID back).
        var clubId = Guid.NewGuid();
        var club = new Club
        {
            Id = clubId,
            Name = clubName,
            SportType = req.Club.SportType,
            Address = req.Club.Address,
            ContactEmail = req.Club.ContactEmail,
        };
        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = emailNormalized,
            PasswordHash = passwordHash,
            Name = req.User.Name.Trim(),
            Phone = req.User.Phone,
            Role = UserRole.ClubAdmin,
            EmailVerified = false,
            ClubId = clubId,
        };

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        try
        {
            db.Clubs.Add(club);
            db.Users.Add(user);
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        catch
        {
            await tx.RollbackAsync(ct);
            throw;
        }

        await SendVerificationCodeAsync(emailNormalized, VerificationCodeKind.Registration, ct);
    }

    public async Task SendVerificationCodeAsync(
        string email, VerificationCodeKind kind, CancellationToken ct = default)
    {
        var emailNormalized = email.ToLowerInvariant();
        var code = GenerateCode();

        db.EmailVerifications.Add(new EmailVerification
        {
            Id = Guid.NewGuid(),
            Email = emailNormalized,
            Code = code,
            Type = TypeColumnValue(kind),
            ExpiresAt = DateTime.UtcNow.AddMinutes(CodeExpiryMinutes),
        });
        await db.SaveChangesAsync(ct);

        // TODO: uncomment Resend wiring before production. The current stub
        // logs the OTP at Warning level instead of mailing it.
        await emailSender.SendVerificationCodeAsync(emailNormalized, code, kind, ct);
    }

    public async Task VerifyEmailAsync(string email, string code, CancellationToken ct = default)
    {
        var emailNormalized = email.ToLowerInvariant();
        var verification = await db.EmailVerifications
            .Where(v => v.Email == emailNormalized
                     && v.Code == code
                     && v.Type == TypeColumnValue(VerificationCodeKind.Registration)
                     && v.ExpiresAt > DateTime.UtcNow
                     && v.UsedAt == null)
            .OrderByDescending(v => v.CreatedAt)
            .FirstOrDefaultAsync(ct);

        if (verification is null)
            throw new AppException("Invalid or expired verification code", 400);

        verification.UsedAt = DateTime.UtcNow;
        await db.Users
            .IgnoreQueryFilters()
            .Where(u => u.Email == emailNormalized)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.EmailVerified, true), ct);
        await db.SaveChangesAsync(ct);
    }

    public async Task<LoginResponse> LoginAsync(string email, string password, CancellationToken ct = default)
    {
        var emailNormalized = email.ToLowerInvariant();
        var user = await db.Users
            .IgnoreQueryFilters()
            .Include(u => u.Club)
            .FirstOrDefaultAsync(u => u.Email == emailNormalized, ct);

        if (user is null)
            throw new AppException("Invalid email or password", 401);

        if (!BCrypt.Net.BCrypt.Verify(password, user.PasswordHash))
            throw new AppException("Invalid email or password", 401);

        if (!user.EmailVerified)
            throw new AppException("Please verify your email before logging in", 403);

        if (!user.IsActive)
            throw new AppException("Account is deactivated", 403);

        if (user.Club is { IsActive: false })
            throw new AppException("This club has been disabled", 403);

        return new LoginResponse
        {
            Token = SignToken(user.Id),
            User = new LoginUserInfo
            {
                Id = user.Id,
                ClubId = user.ClubId,
                Name = user.Name,
                Email = user.Email,
                Role = user.Role,
                ClubName = user.Club?.Name,
            },
        };
    }

    public async Task ForgotPasswordAsync(string email, CancellationToken ct = default)
    {
        var emailNormalized = email.ToLowerInvariant();
        var exists = await db.Users
            .IgnoreQueryFilters()
            .AnyAsync(u => u.Email == emailNormalized
                        && u.EmailVerified
                        && u.IsActive, ct);
        if (!exists)
        {
            log.LogInformation("forgot-password called for unknown email (silent)");
            return;
        }

        await SendVerificationCodeAsync(emailNormalized, VerificationCodeKind.PasswordReset, ct);
    }

    public async Task ResetPasswordAsync(
        string email, string code, string newPassword, CancellationToken ct = default)
    {
        // The validator already enforces NewPassword length, but re-check here
        // so direct callers (tests, internal triggers) cannot bypass it.
        if (string.IsNullOrEmpty(newPassword) || newPassword.Length < 6)
            throw new AppException("Password must be at least 6 characters", 400);

        var emailNormalized = email.ToLowerInvariant();
        var verification = await db.EmailVerifications
            .Where(v => v.Email == emailNormalized
                     && v.Code == code
                     && v.Type == TypeColumnValue(VerificationCodeKind.PasswordReset)
                     && v.ExpiresAt > DateTime.UtcNow
                     && v.UsedAt == null)
            .OrderByDescending(v => v.CreatedAt)
            .FirstOrDefaultAsync(ct);

        if (verification is null)
            throw new AppException("Invalid or expired reset code", 400);

        verification.UsedAt = DateTime.UtcNow;
        var hash = BCrypt.Net.BCrypt.HashPassword(newPassword, SaltRounds);
        await db.Users
            .IgnoreQueryFilters()
            .Where(u => u.Email == emailNormalized)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.PasswordHash, hash), ct);
        await db.SaveChangesAsync(ct);
    }

    public async Task ChangePasswordAsync(
        Guid userId, string currentPassword, string newPassword, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(newPassword) || newPassword.Length < 6)
            throw new AppException("New password must be at least 6 characters", 400);

        var user = await db.Users
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Id == userId, ct);

        if (user is null)
            throw new AppException("User not found", 404);

        if (!BCrypt.Net.BCrypt.Verify(currentPassword, user.PasswordHash))
            throw new AppException("Current password is incorrect", 400);

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(newPassword, SaltRounds);
        await db.SaveChangesAsync(ct);
    }

    public async Task<ProfileResponse?> GetProfileAsync(Guid userId, CancellationToken ct = default)
    {
        var user = await db.Users
            .IgnoreQueryFilters()
            .Include(u => u.Club)
            .FirstOrDefaultAsync(u => u.Id == userId, ct);

        if (user is null) return null;

        return new ProfileResponse
        {
            Id = user.Id,
            ClubId = user.ClubId,
            Name = user.Name,
            Email = user.Email,
            Phone = user.Phone,
            Role = user.Role,
            IsActive = user.IsActive,
            EmailVerified = user.EmailVerified,
            CreatedAt = user.CreatedAt,
            ClubName = user.Club?.Name,
            ClubLogo = user.Club?.LogoUrl,
        };
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private string SignToken(Guid userId)
    {
        var handler = new JsonWebTokenHandler();
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions.Value.Secret));
        return handler.CreateToken(new SecurityTokenDescriptor
        {
            // Match the Node payload exactly: { sub, iat, exp }. iat is added
            // automatically by JsonWebTokenHandler.
            Subject = new ClaimsIdentity(new[] { new Claim("sub", userId.ToString()) }),
            Expires = DateTime.UtcNow.Add(ParseExpiresIn(jwtOptions.Value.ExpiresIn)),
            SigningCredentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256),
        });
    }

    // Parses jsonwebtoken-style duration strings ("7d", "1h", "30m", "60s",
    // or bare seconds). Defaults to 7 days if input is empty.
    private static TimeSpan ParseExpiresIn(string input)
    {
        if (string.IsNullOrWhiteSpace(input)) return TimeSpan.FromDays(7);

        var suffix = input[^1];
        var numPart = input.AsSpan(0, input.Length - 1);
        return suffix switch
        {
            'd' => TimeSpan.FromDays(int.Parse(numPart)),
            'h' => TimeSpan.FromHours(int.Parse(numPart)),
            'm' => TimeSpan.FromMinutes(int.Parse(numPart)),
            's' => TimeSpan.FromSeconds(int.Parse(numPart)),
            _ => TimeSpan.FromSeconds(int.Parse(input)),
        };
    }

    // email_verifications.type is a plain VARCHAR holding snake_case strings,
    // not a PG enum, so we serialize by hand here rather than going through
    // NpgsqlSnakeCaseNameTranslator.
    private static string TypeColumnValue(VerificationCodeKind kind) => kind switch
    {
        VerificationCodeKind.Registration => "registration",
        VerificationCodeKind.PasswordReset => "password_reset",
        _ => throw new ArgumentOutOfRangeException(nameof(kind)),
    };
}
