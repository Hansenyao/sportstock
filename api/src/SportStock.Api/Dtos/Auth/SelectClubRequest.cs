namespace SportStock.Api.Dtos.Auth;

// POST /api/v1/auth/select-club — exchanges an unscoped token for a
// scoped one tied to the chosen club.
public sealed class SelectClubRequest
{
    public Guid ClubId { get; set; }
}
