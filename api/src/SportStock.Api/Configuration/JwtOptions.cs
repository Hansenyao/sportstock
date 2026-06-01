using System.ComponentModel.DataAnnotations;

namespace SportStock.Api.Configuration;

public sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    // Must equal the value used by the Node backend during cutover so tokens
    // issued by either implementation validate on the other.
    [Required] public string Secret { get; set; } = string.Empty;

    // Accepts the same "7d"-style strings as the Node `jsonwebtoken` library
    // (parsed by JwtOptionsExtensions.ToTimeSpan in Program.cs).
    [Required] public string ExpiresIn { get; set; } = "7d";
}
