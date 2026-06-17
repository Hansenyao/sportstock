#nullable enable
using System;

namespace SportStock.Api.Data.Entities;

public partial class KitItem
{
    public Guid Id { get; set; }
    public Guid KitId { get; set; }
    public Guid AssetTypeId { get; set; }
    public int Quantity { get; set; }

    public virtual Kit Kit { get; set; } = null!;
    public virtual AssetType AssetType { get; set; } = null!;
}
