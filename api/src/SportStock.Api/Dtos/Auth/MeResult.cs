using SportStock.Api.Data.Enums;

namespace SportStock.Api.Dtos.Auth;

// Response for GET /api/v1/auth/me.
// active_club_id / role are null when the token is unscoped.
public sealed class MeResult
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

    // Populated when token is scoped to a club
    public Guid? ActiveClubId { get; set; }
    public ClubRole? Role { get; set; }
    public string? ClubName { get; set; }
    public string? ClubLogo { get; set; }
}
