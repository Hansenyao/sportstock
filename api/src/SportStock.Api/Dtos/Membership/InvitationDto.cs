using SportStock.Api.Data.Enums;
namespace SportStock.Api.Dtos.Membership;
public record InvitationDto(Guid Id, Guid ClubId, Guid InviteeId, ClubRole Role, string Status, DateTime CreatedAt);
public record ClubInvitationListItem(Guid Id, Guid InviteeId, string FirstName, string LastName, string Email, ClubRole Role, string Status, DateTime CreatedAt);
