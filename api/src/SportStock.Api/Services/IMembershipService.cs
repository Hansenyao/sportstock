using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.Membership;

namespace SportStock.Api.Services;

public interface IMembershipService
{
    Task<InvitationDto> InviteUserAsync(Guid clubId, Guid inviterId, InviteUserRequest req);
    Task<MembershipDto> AcceptInvitationAsync(Guid clubId, Guid invitationId, Guid userId);
    Task DeclineInvitationAsync(Guid clubId, Guid invitationId, Guid userId);
    Task CancelInvitationAsync(Guid clubId, Guid invitationId, Guid adminId);
    Task<List<MemberDto>> ListMembersAsync(Guid clubId);
    Task<List<ClubInvitationListItem>> ListClubInvitationsAsync(Guid clubId);
    Task<List<UserSearchResult>> SearchUsersAsync(Guid clubId, string query);
    Task UpdateMemberRoleAsync(Guid clubId, Guid userId, ClubRole newRole, Guid updatedBy);
    Task DeactivateMemberAsync(Guid clubId, Guid userId, Guid removedBy);
}
