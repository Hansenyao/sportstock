#nullable enable
using System;
using System.Collections.Generic;

namespace SportStock.Api.Data.Entities;

public partial class Warehouse
{
    public Guid Id { get; set; }
    public Guid ClubId { get; set; }
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public virtual Club Club { get; set; } = null!;
    public virtual ICollection<AssetItem> AssetItems { get; set; } = new List<AssetItem>();
}
