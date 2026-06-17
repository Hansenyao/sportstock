namespace SportStock.Api.Dtos.Auth;

public sealed class UpdateProfileRequest
{
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string? Phone { get; set; }
}
