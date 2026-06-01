namespace SportStock.Api.Dtos.Teams;

public sealed class UpdateTeamRequest
{
    public string? Name { get; set; }
    public string? Gender { get; set; }
    public string? AgeGroup { get; set; }
}
