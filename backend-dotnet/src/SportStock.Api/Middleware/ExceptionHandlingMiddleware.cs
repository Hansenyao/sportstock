using System.Text.Json;
using FluentValidation;
using SportStock.Api.Exceptions;

namespace SportStock.Api.Middleware;

// Catches AppException, FluentValidation.ValidationException, and any other
// unhandled exception, emitting the API's standard JSON error shape:
//   { "statusCode": <int>, "error": <string>, "message": <string> }
//
// Field order is preserved by writing properties in the same order via
// JsonSerializer (which honors declaration order for anonymous types).
// Registered FIRST in the pipeline (before UseAuthentication) so errors from
// any later middleware are also caught.
public sealed class ExceptionHandlingMiddleware(
    RequestDelegate next,
    ILogger<ExceptionHandlingMiddleware> log)
{
    public async Task Invoke(HttpContext ctx)
    {
        try
        {
            await next(ctx);
        }
        catch (AppException ex)
        {
            await WriteJsonAsync(ctx, ex.StatusCode, ex.Error, ex.Message);
        }
        catch (ValidationException ex)
        {
            var first = ex.Errors.FirstOrDefault();
            var message = first?.ErrorMessage ?? "Validation failed";
            await WriteJsonAsync(ctx, 400, "Bad Request", message);
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Unhandled exception");
            await WriteJsonAsync(ctx, 500, "Internal Server Error",
                "An unexpected error occurred");
        }
    }

    private static Task WriteJsonAsync(HttpContext ctx, int status, string error, string message)
    {
        if (ctx.Response.HasStarted)
            return Task.CompletedTask;

        ctx.Response.Clear();
        ctx.Response.StatusCode = status;
        ctx.Response.ContentType = "application/json; charset=utf-8";

        // Cannot use anonymous type with global snake_case policy — field order
        // matters and PropertyNamingPolicy would interfere. Use a fixed-shape
        // serialization with explicit field names to guarantee byte-for-byte
        // parity with the current Node errorHandler.ts output.
        var payload = JsonSerializer.SerializeToUtf8Bytes(new ErrorResponse
        {
            statusCode = status,
            error = error,
            message = message,
        }, ErrorJsonOptions);
        return ctx.Response.Body.WriteAsync(payload).AsTask();
    }

    private static readonly JsonSerializerOptions ErrorJsonOptions = new()
    {
        // Disable any naming policy — properties are already lowerCamel in
        // ErrorResponse and must be emitted exactly as declared.
        PropertyNamingPolicy = null,
        DictionaryKeyPolicy = null,
    };

    // Lowercase property names match the historical Node JSON output exactly.
#pragma warning disable IDE1006 // Naming Styles
    private sealed class ErrorResponse
    {
        public int statusCode { get; init; }
        public string error { get; init; } = "";
        public string message { get; init; } = "";
    }
#pragma warning restore IDE1006
}
