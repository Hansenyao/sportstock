using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SportStock.Api.Auth;
using SportStock.Api.Data;
using SportStock.Api.Exceptions;

namespace SportStock.Api.Middleware;

// Runs immediately after UseAuthentication. Reads the JWT `sub` claim, loads
// the fresh user row from the database with query filters bypassed, and stuffs
// a UserSnapshot into HttpContext.Items so CurrentUser can expose it
// synchronously.
//
// Scoped tokens also carry an `active_club_id` claim. When present, the
// middleware verifies the user is an active member of that club and loads the
// membership row (which carries the per-club role). If the claim refers to a
// club the user doesn't belong to, the request is rejected 401.
//
// Unscoped tokens (no `active_club_id`) resolve to a valid user but with
// HasClubContext = false. These are used during the club-selection flow.
public sealed class JwtUserResolutionMiddleware(RequestDelegate next)
{
    public async Task Invoke(HttpContext ctx, SportStockDbContext db)
    {
        if (ctx.User.Identity?.IsAuthenticated == true)
        {
            var sub = ctx.User.FindFirst("sub")?.Value
                   ?? ctx.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

            if (!Guid.TryParse(sub, out var userId))
                throw new AppException("Invalid or expired token", 401);

            var user = await db.Users
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(u => u.Id == userId);

            if (user is null)   throw new AppException("Invalid or expired token", 401);
            if (!user.IsActive) throw new AppException("Account is deactivated", 403);

            Data.Entities.ClubMembership? membership = null;
            var clubClaim = ctx.User.FindFirst("active_club_id")?.Value;
            if (Guid.TryParse(clubClaim, out var activeClubId))
            {
                membership = await db.ClubMemberships
                    .IgnoreQueryFilters()
                    .Include(m => m.Club)
                    .FirstOrDefaultAsync(m => m.UserId == userId && m.ClubId == activeClubId && m.IsActive);

                if (membership is null)
                    throw new AppException("Invalid or expired token", 401);
                if (!membership.Club.IsActive)
                    throw new AppException("This club has been disabled", 403);
            }

            CurrentUser.SetSnapshot(ctx, user, membership);
        }

        await next(ctx);
    }
}
