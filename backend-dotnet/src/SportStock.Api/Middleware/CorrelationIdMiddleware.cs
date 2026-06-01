using Serilog.Context;

namespace SportStock.Api.Middleware;

// Generates a UUID per request, attaches it to:
//   - HttpContext.TraceIdentifier
//   - Response header X-Correlation-Id
//   - Serilog log context (every log line in the request carries CorrelationId)
//
// New addition (no equivalent in the Node backend). Treated as an operational
// baseline, not a feature — makes triaging production failures dramatically
// easier once we ship.
public sealed class CorrelationIdMiddleware(RequestDelegate next)
{
    private const string HeaderName = "X-Correlation-Id";

    public async Task Invoke(HttpContext ctx)
    {
        var id = ctx.Request.Headers.TryGetValue(HeaderName, out var inbound) && !string.IsNullOrWhiteSpace(inbound)
            ? inbound.ToString()
            : Guid.NewGuid().ToString();

        ctx.TraceIdentifier = id;
        ctx.Response.Headers[HeaderName] = id;

        using (LogContext.PushProperty("CorrelationId", id))
        {
            await next(ctx);
        }
    }
}
