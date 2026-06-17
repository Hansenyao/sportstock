using SportStock.Api.Dtos.Kit;

namespace SportStock.Api.Services;

public interface IKitService
{
    Task<List<KitDto>> ListAsync(Guid clubId);
    Task<KitDetailDto> GetAsync(Guid kitId, Guid clubId);
    Task<KitDto> CreateAsync(Guid clubId, Guid createdBy, CreateKitRequest req);
    Task UpdateAsync(Guid kitId, Guid clubId, UpdateKitRequest req);
    Task DeleteAsync(Guid kitId, Guid clubId);
    Task<KitItemDto> AddItemAsync(Guid kitId, Guid clubId, AddKitItemRequest req);
    Task<KitItemDto> UpdateItemAsync(Guid kitId, Guid kitItemId, Guid clubId, UpdateKitItemRequest req);
    Task RemoveItemAsync(Guid kitId, Guid kitItemId, Guid clubId);
}
