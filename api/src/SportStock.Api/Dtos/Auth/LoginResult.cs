using SportStock.Api.Data.Enums;

namespace SportStock.Api.Dtos.Auth;

// Response for POST /api/v1/auth/login.
// When the user has exactly one club, active_club_id and active_role are
// populated (scoped token). When the user has multiple clubs or is a
// super_admin, those fields are null and the clubs array carries all options.
public sealed class LoginResult
{
    public string Token { get; set; } = string.Empty;
    public bool IsSupAdmin { get; set; }
    public Guid? ActiveClubId { get; set; }
    public ClubRole? ActiveRole { get; set; }
    public List<ClubSummary> Clubs { get; set; } = [];

    public LoginResult() { }

    public LoginResult(
        string token,
        bool isSupAdmin,
        Guid? activeClubId,
        ClubRole? activeRole,
        List<ClubSummary> clubs)
    {
        Token = token;
        IsSupAdmin = isSupAdmin;
        ActiveClubId = activeClubId;
        ActiveRole = activeRole;
        Clubs = clubs;
    }
}

public sealed class ClubSummary
{
    public Guid ClubId { get; set; }
    public string ClubName { get; set; } = string.Empty;
    public ClubRole Role { get; set; }

    public ClubSummary() { }

    public ClubSummary(Guid clubId, string clubName, ClubRole role)
    {
        ClubId = clubId;
        ClubName = clubName;
        Role = role;
    }
}
