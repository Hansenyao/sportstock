using SportStock.Api.Data.Enums;
namespace SportStock.Api.Dtos.Membership;
public record InviteUserRequest(Guid InviteeId, ClubRole Role);
