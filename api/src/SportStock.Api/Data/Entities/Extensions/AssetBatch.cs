using SportStock.Api.Audit;

namespace SportStock.Api.Data.Entities;

// Status is now per asset_item; batch-level status derived from asset_items count.
public partial class AssetBatch : IAuditableEntity
{
    public string AuditEntityType => "asset_batch";
    public Guid?  AuditEntityId  => Id;
    public Guid?  AuditClubId    => AssetType?.ClubId;

    public Dictionary<string, object?> GetAuditMeta() => new()
    {
        ["asset_name"]        = AssetType?.AssetName?.Name,
        ["brand"]             = AssetType?.Brand,
        ["model"]             = AssetType?.Model,
        ["size"]              = AssetType?.Size,
        ["purchase_price"]    = PurchasePrice,
        ["purchase_date"]     = PurchaseDate?.ToString("yyyy-MM-dd"),
        ["useful_life_years"] = UsefulLifeYears,
        ["total_quantity"]    = TotalQuantity,
    };
}
