using Microsoft.EntityFrameworkCore;
using SportStock.Api.Data;
using SportStock.Api.Data.Entities;
using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.Kit;
using SportStock.Api.Exceptions;

namespace SportStock.Api.Services;

public sealed class KitService(SportStockDbContext db) : IKitService
{
    public async Task<List<KitDto>> ListAsync(Guid clubId)
        => await db.Kits
            .Where(k => k.ClubId == clubId && k.IsActive)
            .OrderBy(k => k.Name)
            .Select(k => new KitDto(k.Id, k.Name, k.Description, k.IsActive))
            .ToListAsync();

    public async Task<KitDetailDto> GetAsync(Guid kitId, Guid clubId)
    {
        var kit = await db.Kits
            .Include(k => k.KitItems)
                .ThenInclude(ki => ki.AssetType)
                    .ThenInclude(t => t.AssetName)
            .FirstOrDefaultAsync(k => k.Id == kitId && k.ClubId == clubId && k.IsActive)
            ?? throw new AppException("Kit not found", 404);

        bool isAvailable = true;
        var itemDtos = new List<KitItemDto>();
        foreach (var ki in kit.KitItems)
        {
            var available = await db.AssetItems
                .CountAsync(i => i.AssetTypeId == ki.AssetTypeId
                              && i.ClubId == clubId
                              && i.Status == AssetItemStatus.Available);
            if (available < ki.Quantity) isAvailable = false;
            itemDtos.Add(new KitItemDto(
                ki.Id, ki.AssetTypeId,
                ki.AssetType.AssetName?.Name ?? ki.AssetType.Id.ToString(),
                ki.Quantity, available));
        }

        return new KitDetailDto(kit.Id, kit.Name, kit.Description, isAvailable, itemDtos);
    }

    public async Task<KitDto> CreateAsync(Guid clubId, Guid createdBy, CreateKitRequest req)
    {
        if (await db.Kits.AnyAsync(k => k.ClubId == clubId && k.Name == req.Name && k.IsActive))
            throw new AppException("A kit with this name already exists", 409);

        var kit = new Kit
        {
            Id          = Guid.NewGuid(),
            ClubId      = clubId,
            Name        = req.Name,
            Description = req.Description,
            IsActive    = true,
            CreatedBy   = createdBy,
        };
        db.Kits.Add(kit);
        await db.SaveChangesAsync();
        return new KitDto(kit.Id, kit.Name, kit.Description, kit.IsActive);
    }

    public async Task UpdateAsync(Guid kitId, Guid clubId, UpdateKitRequest req)
    {
        var kit = await db.Kits
            .FirstOrDefaultAsync(k => k.Id == kitId && k.ClubId == clubId && k.IsActive)
            ?? throw new AppException("Kit not found", 404);

        if (req.Name != kit.Name && await db.Kits.AnyAsync(k => k.ClubId == clubId && k.Name == req.Name && k.IsActive))
            throw new AppException("A kit with this name already exists", 409);

        kit.Name        = req.Name;
        kit.Description = req.Description;
        kit.UpdatedAt   = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }

    public async Task DeleteAsync(Guid kitId, Guid clubId)
    {
        var kit = await db.Kits
            .FirstOrDefaultAsync(k => k.Id == kitId && k.ClubId == clubId)
            ?? throw new AppException("Kit not found", 404);

        kit.IsActive  = false;
        kit.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }

    public async Task<KitItemDto> AddItemAsync(Guid kitId, Guid clubId, AddKitItemRequest req)
    {
        var kit = await db.Kits
            .FirstOrDefaultAsync(k => k.Id == kitId && k.ClubId == clubId && k.IsActive)
            ?? throw new AppException("Kit not found", 404);

        if (await db.KitItems.AnyAsync(ki => ki.KitId == kitId && ki.AssetTypeId == req.AssetTypeId))
            throw new AppException("Asset type already in this kit", 409);

        var ki = new KitItem
        {
            Id          = Guid.NewGuid(),
            KitId       = kitId,
            AssetTypeId = req.AssetTypeId,
            Quantity    = req.Quantity,
        };
        db.KitItems.Add(ki);
        await db.SaveChangesAsync();

        var available = await db.AssetItems
            .CountAsync(i => i.AssetTypeId == req.AssetTypeId && i.ClubId == clubId && i.Status == AssetItemStatus.Available);

        return new KitItemDto(ki.Id, ki.AssetTypeId, req.AssetTypeId.ToString(), req.Quantity, available);
    }

    public async Task<KitItemDto> UpdateItemAsync(Guid kitId, Guid kitItemId, Guid clubId, UpdateKitItemRequest req)
    {
        var ki = await db.KitItems
            .Include(ki => ki.Kit)
            .FirstOrDefaultAsync(ki => ki.Id == kitItemId && ki.KitId == kitId && ki.Kit.ClubId == clubId)
            ?? throw new AppException("Kit item not found", 404);

        ki.Quantity = req.Quantity;
        await db.SaveChangesAsync();

        var available = await db.AssetItems
            .CountAsync(i => i.AssetTypeId == ki.AssetTypeId && i.ClubId == clubId && i.Status == AssetItemStatus.Available);

        return new KitItemDto(ki.Id, ki.AssetTypeId, ki.AssetTypeId.ToString(), ki.Quantity, available);
    }

    public async Task RemoveItemAsync(Guid kitId, Guid kitItemId, Guid clubId)
    {
        var ki = await db.KitItems
            .Include(ki => ki.Kit)
            .FirstOrDefaultAsync(ki => ki.Id == kitItemId && ki.KitId == kitId && ki.Kit.ClubId == clubId)
            ?? throw new AppException("Kit item not found", 404);

        db.KitItems.Remove(ki);
        await db.SaveChangesAsync();
    }
}
