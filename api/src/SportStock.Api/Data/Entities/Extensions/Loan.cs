using System.Collections.Generic;
using SportStock.Api.Audit;
using SportStock.Api.Data.Enums;

namespace SportStock.Api.Data.Entities;

public partial class Loan : IAuditableEntity
{
    public LoanStatus Status { get; set; }

    // IAuditableEntity
    public string AuditEntityType => "loan";
    public Guid?  AuditEntityId   => Id;
    public Guid?  AuditClubId     => ClubId;

    public Dictionary<string, object?> GetAuditMeta() => new()
    {
        ["coach_id"] = CoachId,
        ["team_id"]  = TeamId,
        ["due_date"] = DueDate.ToString("yyyy-MM-dd"),
        ["reason"]   = Reason,
    };
}
