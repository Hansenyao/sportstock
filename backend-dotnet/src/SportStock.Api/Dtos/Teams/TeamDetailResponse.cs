namespace SportStock.Api.Dtos.Teams;

// Mirrors Node getTeam / createTeam / updateTeam return shape: full Team row
// plus a members[] array ordered by role priority (head_coach,
// assistant_coach, team_manager) then by member name.
public sealed class TeamDetailResponse
{
    public Guid Id { get; set; }
    public Guid ClubId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Gender { get; set; } = string.Empty;
    public string AgeGroup { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public IReadOnlyList<TeamMemberInfo> Members { get; set; } = Array.Empty<TeamMemberInfo>();
}
