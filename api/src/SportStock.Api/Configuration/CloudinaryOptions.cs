using System.ComponentModel.DataAnnotations;

namespace SportStock.Api.Configuration;

public sealed class CloudinaryOptions
{
    public const string SectionName = "Cloudinary";

    [Required] public string CloudName { get; set; } = string.Empty;
    [Required] public string ApiKey    { get; set; } = string.Empty;
    [Required] public string ApiSecret { get; set; } = string.Empty;
}
