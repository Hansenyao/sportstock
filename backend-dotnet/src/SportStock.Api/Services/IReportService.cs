using SportStock.Api.Dtos.Reports;

namespace SportStock.Api.Services;

public interface IReportService
{
    Task<SummaryResponse> GetSummaryAsync(Guid clubId, CancellationToken ct = default);
    Task<DepreciationReportResponse> GetDepreciationAsync(Guid clubId, CancellationToken ct = default);
    Task<LoanUsageResponse> GetLoanUsageAsync(Guid clubId, LoanUsageQuery query, CancellationToken ct = default);
    Task<IReadOnlyList<MovementsSummaryItem>> GetMovementsAsync(Guid clubId, MovementsRangeQuery query, CancellationToken ct = default);
    Task<IReadOnlyList<RecentMovementItem>> GetRecentMovementsAsync(Guid clubId, CancellationToken ct = default);
    Task<AlertsResponse> GetAlertsAsync(Guid clubId, CancellationToken ct = default);
}
