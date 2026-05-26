using SportStock.Api.Dtos.AssetNames;

namespace SportStock.Api.Services;

public interface IAssetNameService
{
    Task<IReadOnlyList<AssetNameListItem>> ListAsync(Guid clubId, CancellationToken ct = default);

    Task<AssetNameDetail> CreateAsync(Guid clubId, CreateAssetNameRequest req, CancellationToken ct = default);

    Task<AssetNameDetail> UpdateAsync(Guid id, Guid clubId, UpdateAssetNameRequest req, CancellationToken ct = default);

    Task DeleteAsync(Guid id, Guid clubId, CancellationToken ct = default);
}
