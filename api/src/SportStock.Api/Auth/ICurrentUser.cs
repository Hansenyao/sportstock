using SportStock.Api.Data.Enums;

namespace SportStock.Api.Auth;

// Scoped service representing the authenticated user for the current request.
// Injected into DbContext (for the multi-tenant query filter) and into
// services / validators that need identity. Never read HttpContext directly
// from business code — go through this interface instead so tests can swap
// in a fake.
public interface ICurrentUser
{
    bool IsAuthenticated { get; }
    Guid UserId { get; }
    bool IsSupAdmin { get; }

    // Null when token is unscoped (user hasn't selected a club yet)
    Guid? ActiveClubId { get; }
    ClubRole? Role { get; }

    string FirstName { get; }
    string LastName { get; }
    string Email { get; }

    bool HasClubContext { get; }
}
