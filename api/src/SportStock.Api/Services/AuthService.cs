using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
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

// AuthService v2: user-only registration, club creation by authenticated user,
// multi-club login (scoped vs unscoped token), and club selection.
//
// Preserved quirks from v1:
//   - GenerateCode returns "123456" (no real random until Resend is wired).
//   - email is always lowercased before storage / lookup.
//   - forgot-password is silent when the email is unknown (anti-enumeration).
//   - login returns a single 401 for wrong email or password.
internal sealed class AuthService(
    SportStockDbContext _db,
    IEmailSender _emailSender,
    IOptions<JwtOptions> _jwtOptions,
    ILogger<AuthService> _log) : IAuthService
{
    private const int SaltRounds = 10;
    private const int CodeExpiryMinutes = 15;

    // TODO: restore real code generation before production
    private static string GenerateCode() => "123456";

    // ── Public registration: user-only ────────────────────────────────────────

    public async Task<RegisterUserResult> RegisterUserAsync(RegisterUserRequest req)
    {
        if (await _db.Users.AnyAsync(u => u.Email == req.Email.ToLowerInvariant()))
            throw new AppException("Email already registered", 409);

        var user = new User
        {
            Id            = Guid.NewGuid(),
            Email         = req.Email.ToLowerInvariant(),
            PasswordHash  = BCrypt.Net.BCrypt.HashPassword(req.Password, SaltRounds),
            FirstName     = req.FirstName,
            LastName      = req.LastName,
            Phone         = req.Phone,
            IsActive      = true,
            EmailVerified = false,
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        // Current stage: OTP hardcoded to "123456", no actual email sent
        await SendVerificationOtpAsync(user.Email);

        return new RegisterUserResult(user.Id, user.Email, user.FirstName, user.LastName);
    }

    // ── Authenticated: create a club ──────────────────────────────────────────

    public async Task<RegisterClubResult> RegisterClubAsync(RegisterClubRequest req, Guid callerId)
    {
        var caller = await _db.Users.FindAsync(callerId)
            ?? throw new AppException("User not found", 404);

        var club = new Club
        {
            Id              = Guid.NewGuid(),
            Name            = req.ClubName,
            SportTypeId     = req.SportTypeId,
            ContactEmail    = req.ContactEmail,
            OwnerId         = callerId,
            IsActive        = true,
            RetirementAlertMode = "percent",
        };
        _db.Clubs.Add(club);

        var membership = new ClubMembership
        {
            Id       = Guid.NewGuid(),
            ClubId   = club.Id,
            UserId   = callerId,
            Role     = ClubRole.ClubAdmin,
            IsActive = true,
            JoinedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
        };
        _db.ClubMemberships.Add(membership);
        await _db.SaveChangesAsync();

        return new RegisterClubResult(club.Id, club.Name, MintScopedToken(caller, membership));
    }

    // ── Login: returns clubs array; auto-scopes if exactly one club ───────────

    public async Task<LoginResult> LoginAsync(LoginRequest req)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == req.Email.ToLowerInvariant())
            ?? throw new AppException("Invalid credentials", 401);

        if (!BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
            throw new AppException("Invalid credentials", 401);
        if (!user.EmailVerified)
            throw new AppException("Email not verified", 403);
        if (!user.IsActive)
            throw new AppException("Account is deactivated", 403);

        var memberships = await _db.ClubMemberships
            .Include(m => m.Club)
            .Where(m => m.UserId == user.Id && m.IsActive && m.Club.IsActive)
            .ToListAsync();

        string token;
        Guid? activeClubId = null;
        ClubRole? activeRole = null;

        if (user.IsSupAdmin)
        {
            token = MintUnscopedToken(user, memberships);
        }
        else if (memberships.Count == 1)
        {
            activeClubId = memberships[0].ClubId;
            activeRole   = memberships[0].Role;
            token = MintScopedToken(user, memberships[0]);
        }
        else
        {
            token = MintUnscopedToken(user, memberships);
        }

        return new LoginResult(
            token,
            user.IsSupAdmin,
            activeClubId,
            activeRole,
            memberships.Select(m => new ClubSummary(m.ClubId, m.Club.Name, m.Role, m.Club.LogoUrl)).ToList());
    }

    // ── Select club: exchange unscoped token for scoped ───────────────────────

    public async Task<string> SelectClubAsync(Guid userId, Guid clubId)
    {
        var membership = await _db.ClubMemberships
            .Include(m => m.Club)
            .FirstOrDefaultAsync(m => m.UserId == userId && m.ClubId == clubId && m.IsActive)
            ?? throw new AppException("Club not found or access denied", 403);

        if (!membership.Club.IsActive)
            throw new AppException("This club has been disabled", 403);

        var user = await _db.Users.FindAsync(userId)
            ?? throw new AppException("User not found", 404);

        return MintScopedToken(user, membership);
    }

    // ── Get current user profile ──────────────────────────────────────────────

    public async Task<MeResult> GetMeAsync(Guid userId, Guid? activeClubId)
    {
        var user = await _db.Users
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Id == userId)
            ?? throw new AppException("User not found", 404);

        ClubMembership? membership = null;
        if (activeClubId.HasValue)
        {
            membership = await _db.ClubMemberships
                .IgnoreQueryFilters()
                .Include(m => m.Club)
                .FirstOrDefaultAsync(m => m.UserId == userId && m.ClubId == activeClubId.Value);
        }

        return new MeResult
        {
            Id            = user.Id,
            FirstName     = user.FirstName,
            LastName      = user.LastName,
            Email         = user.Email,
            Phone         = user.Phone,
            IsSupAdmin    = user.IsSupAdmin,
            IsActive      = user.IsActive,
            EmailVerified = user.EmailVerified,
            CreatedAt     = user.CreatedAt,
            ActiveClubId  = membership?.ClubId,
            Role          = membership?.Role,
            ClubName      = membership?.Club?.Name,
            ClubLogo      = membership?.Club?.LogoUrl,
            AvatarUrl     = user.AvatarUrl,
        };
    }

    // ── Email verification ────────────────────────────────────────────────────

    public async Task VerifyEmailAsync(string email, string code)
    {
        var emailNormalized = email.ToLowerInvariant();
        var verification = await _db.EmailVerifications
            .Where(v => v.Email == emailNormalized
                     && v.Code == code
                     && v.Type == TypeColumnValue(VerificationCodeKind.Registration)
                     && v.ExpiresAt > DateTime.UtcNow
                     && v.UsedAt == null)
            .OrderByDescending(v => v.CreatedAt)
            .FirstOrDefaultAsync();

        if (verification is null)
            throw new AppException("Invalid or expired verification code", 400);

        verification.UsedAt = DateTime.UtcNow;
        await _db.Users
            .IgnoreQueryFilters()
            .Where(u => u.Email == emailNormalized)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.EmailVerified, true));
        await _db.SaveChangesAsync();
    }

    // ── Password reset ────────────────────────────────────────────────────────

    public async Task ForgotPasswordAsync(string email)
    {
        var emailNormalized = email.ToLowerInvariant();
        var exists = await _db.Users
            .IgnoreQueryFilters()
            .AnyAsync(u => u.Email == emailNormalized && u.EmailVerified && u.IsActive);
        if (!exists)
        {
            _log.LogInformation("forgot-password called for unknown email (silent)");
            return;
        }

        await SendVerificationCodeAsync(emailNormalized, VerificationCodeKind.PasswordReset);
    }

    public async Task ResetPasswordAsync(ResetPasswordRequest req)
    {
        if (string.IsNullOrEmpty(req.NewPassword) || req.NewPassword.Length < 6)
            throw new AppException("Password must be at least 6 characters", 400);

        var emailNormalized = req.Email.ToLowerInvariant();
        var verification = await _db.EmailVerifications
            .Where(v => v.Email == emailNormalized
                     && v.Code == req.Code
                     && v.Type == TypeColumnValue(VerificationCodeKind.PasswordReset)
                     && v.ExpiresAt > DateTime.UtcNow
                     && v.UsedAt == null)
            .OrderByDescending(v => v.CreatedAt)
            .FirstOrDefaultAsync();

        if (verification is null)
            throw new AppException("Invalid or expired reset code", 400);

        verification.UsedAt = DateTime.UtcNow;
        var hash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword, SaltRounds);
        await _db.Users
            .IgnoreQueryFilters()
            .Where(u => u.Email == emailNormalized)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.PasswordHash, hash));
        await _db.SaveChangesAsync();
    }

    // ── Change password (authenticated) ──────────────────────────────────────

    public async Task ChangePasswordAsync(
        Guid userId, string currentPassword, string newPassword, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(newPassword) || newPassword.Length < 6)
            throw new AppException("New password must be at least 6 characters", 400);

        var user = await _db.Users
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Id == userId, ct);

        if (user is null)
            throw new AppException("User not found", 404);

        if (!BCrypt.Net.BCrypt.Verify(currentPassword, user.PasswordHash))
            throw new AppException("Current password is incorrect", 400);

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(newPassword, SaltRounds);
        await _db.SaveChangesAsync(ct);
    }

    // ── Send verification code (resend endpoint) ──────────────────────────────

    public async Task SendVerificationCodeAsync(
        string email, VerificationCodeKind kind, CancellationToken ct = default)
    {
        var emailNormalized = email.ToLowerInvariant();
        var code = GenerateCode();

        _db.EmailVerifications.Add(new EmailVerification
        {
            Id        = Guid.NewGuid(),
            Email     = emailNormalized,
            Code      = code,
            Type      = TypeColumnValue(kind),
            ExpiresAt = DateTime.UtcNow.AddMinutes(CodeExpiryMinutes),
        });
        await _db.SaveChangesAsync(ct);

        await _emailSender.SendVerificationCodeAsync(emailNormalized, code, kind, ct);
    }

    // ── Private JWT helpers ───────────────────────────────────────────────────

    private string MintScopedToken(User user, ClubMembership m)
    {
        var claims = new[]
        {
            new Claim("sub",             user.Id.ToString()),
            new Claim("email",           user.Email),
            new Claim("first_name",      user.FirstName),
            new Claim("last_name",       user.LastName),
            new Claim("is_super_admin",  user.IsSupAdmin.ToString().ToLower()),
            new Claim("active_club_id",  m.ClubId.ToString()),
            new Claim("club_role",       m.Role.ToString()),
        };
        return BuildJwt(claims);
    }

    private string MintUnscopedToken(User user, List<ClubMembership> memberships)
    {
        var claims = new List<Claim>
        {
            new("sub",            user.Id.ToString()),
            new("email",          user.Email),
            new("first_name",     user.FirstName),
            new("last_name",      user.LastName),
            new("is_super_admin", user.IsSupAdmin.ToString().ToLower()),
        };
        claims.Add(new Claim("clubs", JsonSerializer.Serialize(
            memberships.Select(m => new
            {
                club_id   = m.ClubId,
                club_name = m.Club.Name,
                role      = m.Role.ToString(),
            }))));
        return BuildJwt(claims);
    }

    private string BuildJwt(IEnumerable<Claim> claims)
    {
        var handler = new JsonWebTokenHandler();
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtOptions.Value.Secret));
        return handler.CreateToken(new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = DateTime.UtcNow.Add(ParseExpiresIn(_jwtOptions.Value.ExpiresIn)),
            SigningCredentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256),
        });
    }

    // Internal helper used by RegisterUserAsync (no CancellationToken needed).
    private async Task SendVerificationOtpAsync(string emailNormalized)
    {
        var code = GenerateCode();
        _db.EmailVerifications.Add(new EmailVerification
        {
            Id        = Guid.NewGuid(),
            Email     = emailNormalized,
            Code      = code,
            Type      = TypeColumnValue(VerificationCodeKind.Registration),
            ExpiresAt = DateTime.UtcNow.AddMinutes(CodeExpiryMinutes),
        });
        await _db.SaveChangesAsync();
        await _emailSender.SendVerificationCodeAsync(
            emailNormalized, code, VerificationCodeKind.Registration, CancellationToken.None);
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
            _   => TimeSpan.FromSeconds(int.Parse(input)),
        };
    }

    // email_verifications.type is a plain VARCHAR holding snake_case strings.
    private static string TypeColumnValue(VerificationCodeKind kind) => kind switch
    {
        VerificationCodeKind.Registration => "registration",
        VerificationCodeKind.PasswordReset => "password_reset",
        _ => throw new ArgumentOutOfRangeException(nameof(kind)),
    };
}
