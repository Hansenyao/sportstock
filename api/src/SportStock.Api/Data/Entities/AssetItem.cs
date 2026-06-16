#nullable enable
using System;
using System.Collections.Generic;
using SportStock.Api.Audit;
using SportStock.Api.Data.Enums;

namespace SportStock.Api.Data.Entities;

public partial class AssetItem : IAuditableEntity
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

    // IAuditableEntity
    public string AuditEntityType => "asset_item";
    public Guid?  AuditEntityId   => Id;
    public Guid?  AuditClubId     => ClubId;

    public Dictionary<string, object?> GetAuditMeta() => new()
    {
        ["serial_number"]  = SerialNumber,
        ["asset_name"]     = AssetType?.AssetName?.Name,
        ["brand"]          = AssetType?.Brand,
        ["model"]          = AssetType?.Model,
        ["warehouse_name"] = Warehouse?.Name,
        ["batch_id"]       = BatchId,
        ["status"]         = Status.ToString(),
    };
}
