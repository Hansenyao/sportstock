using SportStock.Api.Dtos.Common;
using SportStock.Api.Dtos.Inventory;

namespace SportStock.Api.Services;

public interface IInventoryService
{
    Task<PaginatedResult<MovementListItem>> ListMovementsAsync(
        Guid clubId, ListMovementsQuery query, CancellationToken ct = default);

    Task<AssetBatchResponse> AdjustBatchAsync(
        Guid clubId, Guid operatorId, Guid batchId, AdjustBatchRequest req, CancellationToken ct = default);

    Task<AssetBatchResponse> RetireBatchAsync(
        Guid clubId, Guid operatorId, Guid batchId, RetireBatchRequest req, CancellationToken ct = default);

    Task<AssetBatchResponse> CompleteMaintenanceAsync(
        Guid clubId, Guid operatorId, Guid batchId, MaintenanceBatchRequest req, CancellationToken ct = default);

    Task<IReadOnlyList<StocktakeSessionListItem>> ListStocktakesAsync(
        Guid clubId, int page, int limit, CancellationToken ct = default);

    Task<StocktakeSessionListItem> CreateStocktakeAsync(
        Guid clubId, Guid conductedBy, CreateStocktakeRequest req, CancellationToken ct = default);

    Task<StocktakeSessionDetailResponse> GetStocktakeAsync(
        Guid sessionId, Guid clubId, CancellationToken ct = default);

    Task<StocktakeSessionListItem> UpdateStocktakeAsync(
        Guid sessionId, Guid clubId, UpdateStocktakeRequest req, CancellationToken ct = default);
}
