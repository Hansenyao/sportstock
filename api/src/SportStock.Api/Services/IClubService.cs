using SportStock.Api.Dtos.Clubs;

namespace SportStock.Api.Services;

public interface IClubService
{
    Task<ClubResponse> GetAsync(Guid clubId, CancellationToken ct = default);

    Task<ClubResponse> UpdateAsync(Guid clubId, UpdateClubRequest req, CancellationToken ct = default);

    Task<UploadLogoResponse> UpdateLogoAsync(
        Guid clubId,
        Stream content,
        string contentType,
        string originalFileName,
        CancellationToken ct = default);
}
