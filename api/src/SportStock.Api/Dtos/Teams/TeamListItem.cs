namespace SportStock.Api.Dtos.Teams;

// Mirrors Node listTeams projection: SELECT t.*, COUNT(tm.id) AS member_count.
public sealed class TeamListItem
{
    public Guid Id { get; set; }
    public Guid ClubId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Gender { get; set; } = string.Empty;
    public string AgeGroup { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public int MemberCount { get; set; }
}
