using SportStock.Api.Data.Entities;
using SportStock.Api.Data.Enums;

namespace SportStock.Api.Auth;

// Default ICurrentUser implementation. Reads a User snapshot that
// JwtUserResolutionMiddleware places in HttpContext.Items earlier in the
// pipeline. By keeping this synchronous and stateless, DbContext can inject
// ICurrentUser without a circular dependency on the database.
internal sealed class CurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    public const string HttpContextKey = "sportstock_current_user";

    private User? Snapshot => accessor.HttpContext?.Items[HttpContextKey] as User;

    public bool IsAuthenticated => Snapshot is not null;
    public Guid UserId => Snapshot?.Id ?? Guid.Empty;
    public Guid? ClubId => Snapshot?.ClubId;
    public UserRole Role => Snapshot?.Role ?? UserRole.Coach;
    public string Name => Snapshot?.Name ?? string.Empty;
    public string Email => Snapshot?.Email ?? string.Empty;

    internal static void SetSnapshot(HttpContext ctx, User user) =>
        ctx.Items[HttpContextKey] = user;
}
