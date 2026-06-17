using SportStock.Api.Data.Entities;
using SportStock.Api.Data.Enums;

namespace SportStock.Api.Auth;

internal sealed record UserSnapshot(User User, ClubMembership? ActiveMembership);

// Default ICurrentUser implementation. Reads a UserSnapshot that
// JwtUserResolutionMiddleware places in HttpContext.Items earlier in the
// pipeline. By keeping this synchronous and stateless, DbContext can inject
// ICurrentUser without a circular dependency on the database.
internal sealed class CurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    public const string HttpContextKey = "sportstock_current_user";

    private UserSnapshot? Snap => accessor.HttpContext?.Items[HttpContextKey] as UserSnapshot;

    public bool IsAuthenticated  => Snap is not null;
    public Guid UserId           => Snap?.User.Id ?? Guid.Empty;
    public bool IsSupAdmin       => Snap?.User.IsSupAdmin ?? false;
    public Guid? ActiveClubId    => Snap?.ActiveMembership?.ClubId;
    public ClubRole? Role        => Snap?.ActiveMembership?.Role;
    public bool HasClubContext   => Snap?.ActiveMembership is not null;
    public string FirstName      => Snap?.User.FirstName ?? string.Empty;
    public string LastName       => Snap?.User.LastName ?? string.Empty;
    public string Email          => Snap?.User.Email ?? string.Empty;

    internal static void SetSnapshot(HttpContext ctx, User user, ClubMembership? membership) =>
        ctx.Items[HttpContextKey] = new UserSnapshot(user, membership);
}
