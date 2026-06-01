namespace SportStock.Api.Dtos.AssetNames;

// Mirrors Node listAssetNames projection:
//   SELECT an.*, c.name AS category_name,
//          COUNT(at.id) FILTER (WHERE at.is_active = true) AS type_count
// `category_name` is nullable because the join is LEFT (asset_names.category_id is nullable).
// `type_count` ships as int (EF Core Count). Node's pg client serialized bigint as a JSON
// string; in .NET we use a clean int — no current test depends on the string form and the
// frontend tolerates either via Number() coercion.
public sealed class AssetNameListItem
{
    public Guid Id { get; set; }
    public Guid ClubId { get; set; }
    public string Name { get; set; } = string.Empty;
    public Guid? CategoryId { get; set; }
    public DateTime CreatedAt { get; set; }
    public string? CategoryName { get; set; }
    public int TypeCount { get; set; }
}
