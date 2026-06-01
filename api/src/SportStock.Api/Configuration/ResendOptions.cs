namespace SportStock.Api.Configuration;

// Placeholder. Resend is intentionally not wired during the migration:
// StubEmailSender is the active IEmailSender registration. Options are
// preserved so production switch-over later requires only a registration
// change in Program.cs.
public sealed class ResendOptions
{
    public const string SectionName = "Resend";

    public string ApiKey { get; set; } = string.Empty;
    public string FromEmail { get; set; } = "noreply@sportstock.com";
}
