using SportStock.Api.Data.Enums;
namespace SportStock.Api.Dtos.Membership;
public record MemberDto(Guid UserId, string FirstName, string LastName, string Email, ClubRole Role, DateTime? JoinedAt, bool IsActive);
