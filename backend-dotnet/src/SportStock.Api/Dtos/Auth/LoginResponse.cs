using SportStock.Api.Data.Enums;

namespace SportStock.Api.Dtos.Auth;

// Mirrors Node response shape:
//   { token, user: { id, club_id, name, email, role, club_name } }
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
    public UserRole Role { get; set; }
    public string? ClubName { get; set; }
}
