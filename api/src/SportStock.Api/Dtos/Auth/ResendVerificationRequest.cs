namespace SportStock.Api.Dtos.Auth;

public sealed class ResendVerificationRequest
{
    public string Email { get; set; } = string.Empty;
}
