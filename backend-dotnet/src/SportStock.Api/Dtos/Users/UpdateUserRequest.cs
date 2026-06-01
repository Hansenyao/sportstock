namespace SportStock.Api.Dtos.Users;

// Partial update mirroring Node's COALESCE behavior: null = preserve existing.
public sealed class UpdateUserRequest
{
    public string? Name { get; set; }
    public string? Phone { get; set; }
    public string? Role { get; set; }
}
