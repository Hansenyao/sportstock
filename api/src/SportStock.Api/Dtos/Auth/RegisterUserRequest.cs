namespace SportStock.Api.Dtos.Auth;

// POST /api/v1/auth/register — creates a user account only (no club).
// The club is created separately via POST /api/v1/auth/register-club.
public sealed class RegisterUserRequest
{
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string? Phone { get; set; }
}
