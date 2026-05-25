using System.ComponentModel.DataAnnotations;

namespace SportStock.Api.Configuration;

public sealed class DbOptions
{
    public const string SectionName = "Db";

    [Required] public string ConnectionString { get; set; } = string.Empty;
}
