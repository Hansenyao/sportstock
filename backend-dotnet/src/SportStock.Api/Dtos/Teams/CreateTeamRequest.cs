namespace SportStock.Api.Dtos.Teams;

public sealed class CreateTeamRequest
{
    public string Name { get; set; } = string.Empty;
    public string Gender { get; set; } = string.Empty;
    public string AgeGroup { get; set; } = string.Empty;
}
