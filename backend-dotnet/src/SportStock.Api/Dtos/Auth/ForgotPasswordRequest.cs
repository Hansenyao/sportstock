namespace SportStock.Api.Dtos.Auth;

public sealed class ForgotPasswordRequest
{
    public string Email { get; set; } = string.Empty;
}
