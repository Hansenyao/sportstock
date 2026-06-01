namespace SportStock.Api.Dtos.Assets;

public sealed class CategoryResponse
{
    public Guid Id { get; set; }
    public Guid? ClubId { get; set; }
    public string Name { get; set; } = string.Empty;
    public bool IsSystem { get; set; }
    public DateTime CreatedAt { get; set; }
}
