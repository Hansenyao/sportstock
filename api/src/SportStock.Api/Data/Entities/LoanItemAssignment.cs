#nullable enable
using System;

namespace SportStock.Api.Data.Entities;

public partial class LoanItemAssignment
{
    public Guid Id { get; set; }
    public Guid LoanItemId { get; set; }
    public Guid AssetItemId { get; set; }
    public DateTime AssignedAt { get; set; }

    public virtual LoanItem LoanItem { get; set; } = null!;
    public virtual AssetItem AssetItem { get; set; } = null!;
}
