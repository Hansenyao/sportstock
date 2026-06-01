using SportStock.Api.Dtos.Common;
using SportStock.Api.Dtos.Users;

namespace SportStock.Api.Services;

public interface IUserService
{
    Task<PaginatedResult<UserListItem>> ListAsync(
        Guid clubId, string? roleFilter, bool? isActiveFilter,
        int page, int limit, CancellationToken ct = default);

    Task<UserDetailResponse> GetAsync(Guid userId, Guid clubId, CancellationToken ct = default);

    Task<UserListItem> CreateAsync(Guid clubId, CreateUserRequest req, CancellationToken ct = default);

    Task<UserListItem> UpdateAsync(Guid targetId, Guid clubId, UpdateUserRequest req, CancellationToken ct = default);

    Task DeactivateAsync(Guid targetId, Guid clubId, Guid requesterId, CancellationToken ct = default);
}
