using SportStock.Api.Data.Enums;
namespace SportStock.Api.Dtos.Membership;
public record MembershipDto(Guid Id, Guid ClubId, Guid UserId, ClubRole Role, DateTime? JoinedAt);
