using SportStock.Api.Data.Enums;

namespace SportStock.Api.Dtos.Auth;

// Legacy response shape — superseded by LoginResult (v2 multi-club).
// Kept for compilation; not returned by any endpoint.
public sealed class LoginResponse
{
    public string Token { get; set; } = string.Empty;
    public LoginUserInfo User { get; set; } = new();
}

public sealed class LoginUserInfo
{
    public Guid Id { get; set; }
    public Guid? ClubId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public ClubRole Role { get; set; }
    public string? ClubName { get; set; }
}
