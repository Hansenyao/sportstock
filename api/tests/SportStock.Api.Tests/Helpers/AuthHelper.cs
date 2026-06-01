using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace SportStock.Api.Tests.Helpers;

// Mints HS256 JWTs that match the production AuthService.SignToken contract:
// payload is exactly { sub, iat, exp }. Use this in tests that want to skip
// the full login round-trip and just attach a token to a request.
//
// The secret MUST match appsettings.Test.json's Jwt:Secret so the same
// JwtBearer middleware that production uses can validate the token.
internal static class AuthHelper
{
    public const string TestJwtSecret =
        "test-only-jwt-secret-do-not-use-in-production-must-be-at-least-256-bits-long";

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
}
