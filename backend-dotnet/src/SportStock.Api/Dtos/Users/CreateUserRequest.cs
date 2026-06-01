namespace SportStock.Api.Dtos.Users;

// Mirrors POST /users body. `role` is optional (defaults to "coach" in Node).
// Accepted as raw string here so a bad value emits AppException(400) from
// UserService rather than a 400 ModelState binding error.
public sealed class CreateUserRequest
{
    public string Email { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Role { get; set; }
    public string? Phone { get; set; }
}
