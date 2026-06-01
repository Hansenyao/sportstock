namespace SportStock.Api.Middleware;

// Helmet-equivalent response headers. Mirrors the defensive defaults applied
// by the Node backend via `helmet()`. HSTS is gated to production to avoid
// pinning HTTPS during local development.
public sealed class SecurityHeadersMiddleware(RequestDelegate next, IWebHostEnvironment env)
{
    public async Task Invoke(HttpContext ctx)
    {
        var headers = ctx.Response.Headers;
        headers["X-Content-Type-Options"] = "nosniff";
        headers["X-Frame-Options"] = "DENY";
        headers["Referrer-Policy"] = "no-referrer";
        headers["X-Permitted-Cross-Domain-Policies"] = "none";

        if (!env.IsDevelopment())
        {
            headers["Strict-Transport-Security"] = "max-age=15552000; includeSubDomains";
        }

        await next(ctx);
    }
}
