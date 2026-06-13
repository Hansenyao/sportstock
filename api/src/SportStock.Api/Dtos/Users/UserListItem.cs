using SportStock.Api.Data.Enums;

namespace SportStock.Api.Dtos.Users;

// Mirrors Node's listUsers SELECT projection 1:1.
public sealed class UserListItem
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public ClubRole Role { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public string? AvatarUrl { get; set; }
}
