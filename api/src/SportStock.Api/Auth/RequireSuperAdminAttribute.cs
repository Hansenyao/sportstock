using Microsoft.AspNetCore.Mvc.Filters;
using SportStock.Api.Exceptions;

namespace SportStock.Api.Auth;

// Gate that restricts a controller or action to platform super-admins only.
// Uses ICurrentUser.IsSupAdmin rather than ClubRole so that the check works
// for users who are not scoped to any particular club.
[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class, AllowMultiple = false)]
public sealed class RequireSuperAdminAttribute : Attribute, IAsyncAuthorizationFilter
{
    public Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        var currentUser = context.HttpContext.RequestServices.GetRequiredService<ICurrentUser>();

        if (!currentUser.IsAuthenticated)
            throw new AppException("Missing Bearer token", 401);

        if (!currentUser.IsSupAdmin)
            throw new AppException("Insufficient permissions", 403);

        return Task.CompletedTask;
    }
}
