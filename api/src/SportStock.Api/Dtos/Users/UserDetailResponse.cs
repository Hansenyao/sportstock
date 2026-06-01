using SportStock.Api.Data.Enums;

namespace SportStock.Api.Dtos.Users;

// GET /users/:id response — superset of the list projection with a nested
// teams[] array sourced from team_members + teams.
public sealed class UserDetailResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public UserRole Role { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public IReadOnlyList<UserTeamMembership> Teams { get; set; } = Array.Empty<UserTeamMembership>();
}

public sealed class UserTeamMembership
{
    public Guid TeamId { get; set; }
    public string TeamRole { get; set; } = string.Empty; // VARCHAR(20), not a PG enum
    public string TeamName { get; set; } = string.Empty;
    public string Gender { get; set; } = string.Empty;
    public string AgeGroup { get; set; } = string.Empty;
}
