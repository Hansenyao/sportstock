#nullable enable
using System;
using System.Collections.Generic;
using SportStock.Api.Data.Enums;

namespace SportStock.Api.Data.Entities;

public partial class AssetItem
{
    public Guid Id { get; set; }
    public Guid ClubId { get; set; }
    public Guid AssetTypeId { get; set; }
    public Guid? BatchId { get; set; }
    public Guid WarehouseId { get; set; }
    public string? SerialNumber { get; set; }
    public AssetItemStatus Status { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public virtual AssetType AssetType { get; set; } = null!;
    public virtual AssetBatch? Batch { get; set; }
    public virtual Warehouse Warehouse { get; set; } = null!;
    public virtual ICollection<LoanItemAssignment> LoanItemAssignments { get; set; } = new List<LoanItemAssignment>();
}
