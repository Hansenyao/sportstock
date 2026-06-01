using System.ComponentModel.DataAnnotations;

namespace SportStock.Api.Configuration;

public sealed class SupabaseOptions
{
    public const string SectionName = "Supabase";

    [Required] public string Url { get; set; } = string.Empty;
    [Required] public string ServiceRoleKey { get; set; } = string.Empty;
    [Required] public string Bucket { get; set; } = "sportstock-assets";
}
