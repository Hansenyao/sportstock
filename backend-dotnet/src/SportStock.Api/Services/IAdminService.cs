using SportStock.Api.Dtos.Admin;
using SportStock.Api.Dtos.Common;

namespace SportStock.Api.Services;

public interface IAdminService
{
    Task<PlatformStatsResponse> GetPlatformStatsAsync(CancellationToken ct = default);
    Task<object> GetAnalyticsOverviewAsync(Guid? clubId, CancellationToken ct = default);
    Task<AnalyticsLoansResponse> GetAnalyticsLoansAsync(Guid? clubId, CancellationToken ct = default);
    Task<AnalyticsAssetsResponse> GetAnalyticsAssetsAsync(Guid? clubId, CancellationToken ct = default);
    Task<AnalyticsGrowthResponse> GetAnalyticsGrowthAsync(CancellationToken ct = default);

    Task<PaginatedResult<ClubListItemResponse>> ListClubsAsync(ListClubsQuery query, CancellationToken ct = default);
    Task<ClubDetailResponse> GetClubAsync(Guid clubId, CancellationToken ct = default);
    Task UpdateClubStatusAsync(Guid clubId, bool isActive, CancellationToken ct = default);
    Task<string> ResetClubAdminPasswordAsync(Guid clubId, CancellationToken ct = default);

    Task<PaginatedResult<AdminUserItem>> ListClubUsersAsync(Guid clubId, int page, int limit, CancellationToken ct = default);
    Task UpdateUserStatusAsync(Guid clubId, Guid userId, bool isActive, CancellationToken ct = default);
    Task<string> ResetUserPasswordAsync(Guid clubId, Guid userId, CancellationToken ct = default);

    Task<PaginatedResult<AdminAssetItem>> ListClubAssetsAsync(Guid clubId, ListClubResourcesQuery query, CancellationToken ct = default);
    Task UpdateAssetStatusAsync(Guid clubId, Guid assetTypeId, bool isActive, CancellationToken ct = default);
    Task DeleteAssetAsync(Guid clubId, Guid assetTypeId, CancellationToken ct = default);

    Task<PaginatedResult<AdminLoanItem>> ListClubLoansAsync(Guid clubId, int page, int limit, string? status, CancellationToken ct = default);
}
