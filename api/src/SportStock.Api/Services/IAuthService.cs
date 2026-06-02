using SportStock.Api.Dtos.Auth;
using SportStock.Api.Integrations;

namespace SportStock.Api.Services;

public interface IAuthService
{
    Task<RegisterUserResult> RegisterUserAsync(RegisterUserRequest req);
    Task<RegisterClubResult> RegisterClubAsync(RegisterClubRequest req, Guid callerId);
    Task<LoginResult> LoginAsync(LoginRequest req);
    Task<string> SelectClubAsync(Guid userId, Guid clubId);
    Task<MeResult> GetMeAsync(Guid userId, Guid? activeClubId);
    Task VerifyEmailAsync(string email, string code);
    Task ForgotPasswordAsync(string email);
    Task ResetPasswordAsync(ResetPasswordRequest req);

    // Legacy helpers kept for ChangePassword and ResendVerification endpoints
    Task ChangePasswordAsync(Guid userId, string currentPassword, string newPassword, CancellationToken ct = default);
    Task SendVerificationCodeAsync(string email, VerificationCodeKind kind, CancellationToken ct = default);
}
