namespace SportStock.Api.Dtos.Auth;

public sealed record RegisterClubResult(Guid ClubId, string ClubName, string Token);
