namespace SportStock.Api.Dtos.Auth;

// Payload shape mirrors POST /api/v1/auth/register in the Node backend:
//   { club: { name, sport_type, address?, contact_email },
//     user: { name, email, password, phone? } }
// snake_case <-> PascalCase translation is handled globally by
// JsonNamingPolicy.SnakeCaseLower configured in Program.cs.
public sealed class RegisterRequest
{
    public RegisterClubInfo Club { get; set; } = new();
    public RegisterUserInfo User { get; set; } = new();
}

public sealed class RegisterClubInfo
{
    public string Name { get; set; } = string.Empty;
    public string? SportType { get; set; }
    public string? Address { get; set; }
    public string ContactEmail { get; set; } = string.Empty;
}

public sealed class RegisterUserInfo
{
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string? Phone { get; set; }
}
