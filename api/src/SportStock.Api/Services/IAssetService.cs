using SportStock.Api.Dtos.Assets;
using SportStock.Api.Dtos.Common;

namespace SportStock.Api.Services;

public interface IAssetService
{
    // Categories
    Task<IReadOnlyList<CategoryResponse>> ListCategoriesAsync(Guid clubId, CancellationToken ct = default);
    Task<CategoryResponse> CreateCategoryAsync(Guid clubId, CreateCategoryRequest req, CancellationToken ct = default);

    // Assets (asset_types) — aggregated view
    Task<PaginatedResult<AssetTypeResponse>> ListAsync(Guid clubId, ListAssetsQuery query, CancellationToken ct = default);
    Task<AssetTypeResponse> GetAsync(Guid typeId, Guid clubId, CancellationToken ct = default);
    Task<AssetTypeResponse> CreateAsync(Guid clubId, Guid operatorId, CreateAssetRequest req, CancellationToken ct = default);
    Task<AssetTypeResponse> UpdateAsync(Guid typeId, Guid clubId, UpdateAssetRequest req, CancellationToken ct = default);
    Task DeleteAsync(Guid typeId, Guid clubId, CancellationToken ct = default);
    Task<UploadImageResponse> UploadImageAsync(Guid typeId, Guid clubId, Stream content, string contentType, string fileName, CancellationToken ct = default);

    // Batches
    Task<AssetTypeResponse> AddBatchAsync(Guid typeId, Guid clubId, Guid operatorId, CreateBatchRequest req, CancellationToken ct = default);
    Task<AssetTypeResponse> UpdateBatchAsync(Guid batchId, Guid typeId, Guid clubId, UpdateBatchRequest req, CancellationToken ct = default);

    // Depreciation
    Task<DepreciationResponse> GetDepreciationAsync(Guid batchId, Guid clubId, CancellationToken ct = default);
}
