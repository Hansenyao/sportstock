using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SportStock.Api.Auth;
using SportStock.Api.Data;
using SportStock.Api.Exceptions;

namespace SportStock.Api.Middleware;

// Runs immediately after UseAuthentication. Reads the JWT `sub` claim, loads
// the fresh user row (and its club) from the database with query filters
// bypassed, and stuffs the result into HttpContext.Items so CurrentUser can
// expose it synchronously. Re-querying every request matches the existing
// middleware/auth.ts behavior — the JWT only carries `sub`, so is_active /
// role / club_id changes must be picked up live.
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
                .Include(u => u.Club)
                .FirstOrDefaultAsync(u => u.Id == userId);

            if (user is null)
                throw new AppException("Invalid or expired token", 401);
            if (!user.IsActive)
                throw new AppException("Account is deactivated", 403);
            if (user.Club is { IsActive: false })
                throw new AppException("This club has been disabled", 403);

            CurrentUser.SetSnapshot(ctx, user);
        }

        await next(ctx);
    }
}
