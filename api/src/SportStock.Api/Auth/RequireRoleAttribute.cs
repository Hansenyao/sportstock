using Microsoft.AspNetCore.Mvc.Filters;
using SportStock.Api.Data.Enums;
using SportStock.Api.Exceptions;

namespace SportStock.Api.Auth;

// Custom role gate that emits the API's standard JSON error shape on failure.
// The built-in [Authorize(Roles = ...)] is intentionally not used — its
// default 401/403 responses are plain text and would diverge from the rest
// of the API's { statusCode, error, message } shape.
[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class, AllowMultiple = false)]
public sealed class RequireRoleAttribute(params ClubRole[] allowedRoles) : Attribute, IAsyncAuthorizationFilter
{
    public Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        var currentUser = context.HttpContext.RequestServices.GetRequiredService<ICurrentUser>();

        if (!currentUser.IsAuthenticated)
            throw new AppException("Missing Bearer token", 401);

        if (!allowedRoles.Contains(currentUser.Role))
            throw new AppException("Insufficient permissions", 403);

        return Task.CompletedTask;
    }
}
