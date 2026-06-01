using SportStock.Api.Dtos.Common;
using SportStock.Api.Dtos.WriteOffs;

namespace SportStock.Api.Services;

public interface IWriteOffService
{
    Task<PaginatedResult<WriteOffResponse>> ListAsync(
        Guid clubId, ListWriteOffsQuery query, CancellationToken ct = default);

    Task<WriteOffResponse> GetAsync(Guid id, Guid clubId, CancellationToken ct = default);

    Task<WriteOffResponse> CreateAsync(
        Guid clubId, Guid operatorId, CreateWriteOffRequest req, CancellationToken ct = default);
}
