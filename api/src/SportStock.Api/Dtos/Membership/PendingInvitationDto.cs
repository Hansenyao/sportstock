using SportStock.Api.Data.Enums;

namespace SportStock.Api.Dtos.Membership;

public sealed record PendingInvitationDto(
    Guid InvitationId,
    Guid ClubId,
    string ClubName,
    Guid InvitedById,
    string InvitedByName,
    ClubRole Role,
    DateTime CreatedAt);
