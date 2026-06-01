using SportStock.Api.Dtos.Teams;

namespace SportStock.Api.Services;

public interface ITeamService
{
    Task<IReadOnlyList<TeamListItem>> ListAsync(Guid clubId, CancellationToken ct = default);

    Task<TeamDetailResponse> GetAsync(Guid teamId, Guid clubId, CancellationToken ct = default);

    Task<TeamDetailResponse> CreateAsync(Guid clubId, CreateTeamRequest req, CancellationToken ct = default);

    Task<TeamDetailResponse> UpdateAsync(Guid teamId, Guid clubId, UpdateTeamRequest req, CancellationToken ct = default);

    Task DeleteAsync(Guid teamId, Guid clubId, CancellationToken ct = default);

    Task<TeamMemberInfo> AddMemberAsync(Guid teamId, Guid clubId, Guid userId, string teamRole, CancellationToken ct = default);

    Task<TeamMemberInfo> UpdateMemberRoleAsync(Guid teamId, Guid clubId, Guid userId, string teamRole, CancellationToken ct = default);

    Task RemoveMemberAsync(Guid teamId, Guid clubId, Guid userId, CancellationToken ct = default);
}
