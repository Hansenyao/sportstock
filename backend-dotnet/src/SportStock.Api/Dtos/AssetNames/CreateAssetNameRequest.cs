namespace SportStock.Api.Dtos.AssetNames;

public sealed class CreateAssetNameRequest
{
    public string Name { get; set; } = string.Empty;
    public Guid? CategoryId { get; set; }
}
