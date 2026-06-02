#nullable enable
using System;
using SportStock.Api.Data.Enums;

namespace SportStock.Api.Data.Entities;

public partial class ClubInvitation
{
    public Guid Id { get; set; }
    public Guid ClubId { get; set; }
    public Guid InviteeId { get; set; }
    public Guid InvitedById { get; set; }
    public ClubRole Role { get; set; }
    public string Status { get; set; } = "pending";
    public DateTime CreatedAt { get; set; }
    public DateTime? RespondedAt { get; set; }

    public virtual Club Club { get; set; } = null!;
    public virtual User Invitee { get; set; } = null!;
    public virtual User InvitedBy { get; set; } = null!;
}
