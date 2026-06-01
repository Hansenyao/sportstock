namespace SportStock.Api.Integrations;

// Default IEmailSender. Logs the OTP at Warning level (so it is visible in
// dev consoles) and never makes a network call. Preserves exact Node
// behavior: the OTP is "123456" everywhere, no email is dispatched.
//
// TODO: replace with ResendEmailSender before production. Keep the
// hardcoded "123456" generator in AuthService until that switch happens.
internal sealed class StubEmailSender(ILogger<StubEmailSender> log) : IEmailSender
{
    public Task SendVerificationCodeAsync(
        string email,
        string code,
        VerificationCodeKind kind,
        CancellationToken ct = default)
    {
        log.LogWarning(
            "EMAIL STUB: would send OTP {Code} to {Email} for {Kind}",
            code, email, kind);
        return Task.CompletedTask;
    }
}
