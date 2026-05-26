namespace SportStock.Api.Dtos.Clubs;

// Mirrors Node response shape: { logo_url: "https://..." }.
public sealed class UploadLogoResponse
{
    public string LogoUrl { get; set; } = string.Empty;
}
