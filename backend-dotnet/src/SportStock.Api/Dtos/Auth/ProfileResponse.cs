using SportStock.Api.Data.Enums;

namespace SportStock.Api.Dtos.Auth;

// Mirrors Node /auth/me response — superset of LoginUserInfo including phone,
// is_active, email_verified, created_at, club_logo.
public sealed class ProfileResponse
{
    public Guid Id { get; set; }
    public Guid? ClubId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public UserRole Role { get; set; }
    public bool IsActive { get; set; }
    public bool EmailVerified { get; set; }
    public DateTime CreatedAt { get; set; }
    public string? ClubName { get; set; }
    public string? ClubLogo { get; set; }
}
