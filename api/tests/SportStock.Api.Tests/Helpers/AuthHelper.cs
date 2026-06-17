using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using SportStock.Api.Data.Enums;

namespace SportStock.Api.Tests.Helpers;

// Mints HS256 JWTs for integration tests.
//
// Two overloads are available:
//   - MintToken(userId)                         — unscoped token (sub only)
//   - MintToken(userId, activeClubId, role, …)  — scoped token with club context
//
// The secret MUST match appsettings.Test.json's Jwt:Secret so the same
// JwtBearer middleware that production uses can validate the token.
internal static class AuthHelper
{
    public const string TestJwtSecret =
        "test-only-jwt-secret-do-not-use-in-production-must-be-at-least-256-bits-long";

    /// <summary>Mint an unscoped token (sub only). Compatible with old callers.</summary>
    public static string MintToken(Guid userId, TimeSpan? lifetime = null)
    {
        var handler = new JsonWebTokenHandler();
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(TestJwtSecret));
        return handler.CreateToken(new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(new[] { new Claim("sub", userId.ToString()) }),
            Expires = DateTime.UtcNow.Add(lifetime ?? TimeSpan.FromHours(1)),
            SigningCredentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256),
        });
    }

    /// <summary>
    /// Mint a scoped token. When <paramref name="activeClubId"/> is provided the token
    /// carries <c>active_club_id</c> and <c>club_role</c> claims so
    /// JwtUserResolutionMiddleware sets <see cref="ICurrentUser.HasClubContext"/> = true.
    /// </summary>
    public static string MintToken(
        Guid userId,
        Guid? activeClubId,
        ClubRole? role = null,
        bool isSupAdmin = false,
        TimeSpan? lifetime = null)
    {
        var claims = new List<Claim> { new("sub", userId.ToString()) };

        if (activeClubId.HasValue)
        {
            claims.Add(new Claim("active_club_id", activeClubId.Value.ToString()));
        }
        if (role.HasValue)
        {
            claims.Add(new Claim("club_role", role.Value.ToString()));
        }
        if (isSupAdmin)
        {
            claims.Add(new Claim("is_sup_admin", "true"));
        }

        var handler = new JsonWebTokenHandler();
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(TestJwtSecret));
        return handler.CreateToken(new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = DateTime.UtcNow.Add(lifetime ?? TimeSpan.FromHours(1)),
            SigningCredentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256),
        });
    }
}
