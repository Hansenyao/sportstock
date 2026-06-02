using SportStock.Api.Dtos.SportType;

namespace SportStock.Api.Services;

public interface ISportTypeService
{
    Task<List<SportTypeDto>> ListActiveAsync();
    Task<List<SportTypeDto>> ListAllAsync();
    Task<SportTypeDto> CreateAsync(CreateSportTypeRequest req);
    Task UpdateAsync(Guid id, UpdateSportTypeRequest req);
    Task DeleteAsync(Guid id);
}
