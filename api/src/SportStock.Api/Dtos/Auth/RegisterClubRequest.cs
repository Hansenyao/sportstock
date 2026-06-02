namespace SportStock.Api.Dtos.Auth;

// POST /api/v1/auth/register-club — authenticated user creates a new club.
public sealed class RegisterClubRequest
{
    public string ClubName { get; set; } = string.Empty;
    public Guid? SportTypeId { get; set; }
    public string? ContactEmail { get; set; }
}
