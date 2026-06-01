namespace SportStock.Api.Exceptions;

// Mirrors backend/src/utils/AppError.ts. ExceptionHandlingMiddleware maps this
// 1:1 to the JSON shape { statusCode, error, message } used by the existing
// frontend axios interceptor — preserving byte-for-byte error responses across
// the Node -> .NET migration.
public sealed class AppException : Exception
{
    private static readonly Dictionary<int, string> StatusNames = new()
    {
        [400] = "Bad Request",
        [401] = "Unauthorized",
        [403] = "Forbidden",
        [404] = "Not Found",
        [409] = "Conflict",
        [422] = "Unprocessable Entity",
        [500] = "Internal Server Error",
    };

    public int StatusCode { get; }
    public string Error { get; }

    public AppException(string message, int statusCode = 500) : base(message)
    {
        StatusCode = statusCode;
        Error = StatusNames.GetValueOrDefault(statusCode, "Error");
    }
}
