using System.ComponentModel.DataAnnotations;

namespace SportStock.Api.Configuration;

public sealed class FirebaseOptions
{
    public const string SectionName = "Firebase";

    [Required] public string ProjectId { get; set; } = string.Empty;
    [Required] public string ClientEmail { get; set; } = string.Empty;
    // Vercel / App Service inject newlines as the literal "\n" sequence —
    // FirebaseOptionsValidator (see Program.cs) replaces them at startup.
    [Required] public string PrivateKey { get; set; } = string.Empty;
}
