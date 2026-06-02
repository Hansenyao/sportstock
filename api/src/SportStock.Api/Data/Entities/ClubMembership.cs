#nullable enable
using System;
using SportStock.Api.Data.Enums;

namespace SportStock.Api.Data.Entities;

public partial class ClubMembership
{
    public Guid Id { get; set; }
    public Guid ClubId { get; set; }
    public Guid UserId { get; set; }
    public ClubRole Role { get; set; }
    public bool IsActive { get; set; }
    public Guid? InvitedBy { get; set; }
    public DateTime? JoinedAt { get; set; }
    public DateTime CreatedAt { get; set; }

    public virtual Club Club { get; set; } = null!;
    public virtual User User { get; set; } = null!;
}
