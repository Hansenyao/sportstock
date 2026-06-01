namespace SportStock.Api.Dtos.Assets;

// Mirrors the Node `RETURNING id, image_url` shape exactly.
public sealed class UploadImageResponse
{
    public Guid Id { get; set; }
    public string ImageUrl { get; set; } = string.Empty;
}
