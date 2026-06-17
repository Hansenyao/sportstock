using SportStock.Api.Data.Enums;

namespace SportStock.Api.Dtos.Auth;

// Mirrors /auth/me response shape.
// active_club_id / role are null when the token is unscoped (user hasn't
// selected a club yet). The controller populates these from ICurrentUser
// so the values always reflect the live JWT claims validated by middleware.
public sealed class ProfileResponse
{
    public Guid Id { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public bool IsSupAdmin { get; set; }
    public bool IsActive { get; set; }
    public bool EmailVerified { get; set; }
    public DateTime CreatedAt { get; set; }

    // Populated from ICurrentUser (JWT active_club_id / club_role claims)
    public Guid? ActiveClubId { get; set; }
    public ClubRole? Role { get; set; }
    public string? ClubName { get; set; }
    public string? ClubLogo { get; set; }
}
