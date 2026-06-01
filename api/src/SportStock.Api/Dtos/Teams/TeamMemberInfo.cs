namespace SportStock.Api.Dtos.Teams;

// Mirrors Node fetchMembers projection.
public sealed class TeamMemberInfo
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string TeamRole { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
}
