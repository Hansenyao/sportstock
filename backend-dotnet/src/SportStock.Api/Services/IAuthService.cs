using SportStock.Api.Dtos.Auth;
using SportStock.Api.Integrations;

namespace SportStock.Api.Services;

public interface IAuthService
{
    Task RegisterAsync(RegisterRequest req, CancellationToken ct = default);

    Task SendVerificationCodeAsync(string email, VerificationCodeKind kind, CancellationToken ct = default);

    Task VerifyEmailAsync(string email, string code, CancellationToken ct = default);

    Task<LoginResponse> LoginAsync(string email, string password, CancellationToken ct = default);

    Task ForgotPasswordAsync(string email, CancellationToken ct = default);

    Task ResetPasswordAsync(string email, string code, string newPassword, CancellationToken ct = default);

    Task ChangePasswordAsync(Guid userId, string currentPassword, string newPassword, CancellationToken ct = default);

    Task<ProfileResponse?> GetProfileAsync(Guid userId, CancellationToken ct = default);
}
