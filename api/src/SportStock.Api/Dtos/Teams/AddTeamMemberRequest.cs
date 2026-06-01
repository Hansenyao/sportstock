namespace SportStock.Api.Dtos.Teams;

public sealed class AddTeamMemberRequest
{
    public Guid UserId { get; set; }
    public string TeamRole { get; set; } = string.Empty;
}
