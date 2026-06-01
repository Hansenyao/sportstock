namespace SportStock.Api.Integrations;

// Phase-0 placeholder. StubEmailSender logs the OTP code instead of sending.
// To wire real Resend, swap the DI registration in Program.cs to a future
// ResendEmailSender that implements this same interface.
public interface IEmailSender
{
    Task SendVerificationCodeAsync(
        string email,
        string code,
        VerificationCodeKind kind,
        CancellationToken ct = default);
}

public enum VerificationCodeKind
{
    Registration,
    PasswordReset,
}
