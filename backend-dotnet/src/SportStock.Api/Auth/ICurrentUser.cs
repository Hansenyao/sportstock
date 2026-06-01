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
    Guid? ClubId { get; }       // null for super_admin
    UserRole Role { get; }
    string Name { get; }
    string Email { get; }
}
