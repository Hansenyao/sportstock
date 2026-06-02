namespace SportStock.Api.Data.Entities;

// Extends the auto-generated AssetType with the AssetItems navigation property.
// AssetItem.AssetTypeId → asset_types.id (FK defined in db-init.sql).
public partial class AssetType
{
    public virtual ICollection<AssetItem> AssetItems { get; set; } = new List<AssetItem>();
}
