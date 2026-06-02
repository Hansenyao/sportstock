using Microsoft.EntityFrameworkCore;
using SportStock.Api.Data;
using SportStock.Api.Data.Entities;
using SportStock.Api.Dtos.Warehouse;
using SportStock.Api.Exceptions;

namespace SportStock.Api.Services;

public sealed class WarehouseService(SportStockDbContext db) : IWarehouseService
{
    public async Task<WarehouseListResult> ListAsync(Guid clubId)
    {
        var items = await db.Warehouses
            .Where(w => w.ClubId == clubId && w.IsActive)
            .OrderBy(w => w.Name)
            .Select(w => new WarehouseDto(w.Id, w.Name, w.Description))
            .ToListAsync();

        return new WarehouseListResult(items, AutoSelect: items.Count == 1);
    }

    public async Task<WarehouseDto> CreateAsync(Guid clubId, CreateWarehouseRequest req)
    {
        if (await db.Warehouses.AnyAsync(w => w.ClubId == clubId && w.Name == req.Name && w.IsActive))
            throw new AppException("A warehouse with this name already exists", 409);

        var w = new Warehouse
        {
            Id          = Guid.NewGuid(),
            ClubId      = clubId,
            Name        = req.Name,
            Description = req.Description,
            IsActive    = true,
        };
        db.Warehouses.Add(w);
        await db.SaveChangesAsync();
        return new WarehouseDto(w.Id, w.Name, w.Description);
    }

    public async Task UpdateAsync(Guid clubId, Guid warehouseId, UpdateWarehouseRequest req)
    {
        var w = await db.Warehouses
            .FirstOrDefaultAsync(w => w.Id == warehouseId && w.ClubId == clubId && w.IsActive)
            ?? throw new AppException("Warehouse not found", 404);

        if (req.Name != w.Name && await db.Warehouses.AnyAsync(x => x.ClubId == clubId && x.Name == req.Name && x.IsActive))
            throw new AppException("A warehouse with this name already exists", 409);

        w.Name        = req.Name;
        w.Description = req.Description;
        w.UpdatedAt   = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }

    public async Task DeleteAsync(Guid clubId, Guid warehouseId)
    {
        var w = await db.Warehouses
            .FirstOrDefaultAsync(w => w.Id == warehouseId && w.ClubId == clubId && w.IsActive)
            ?? throw new AppException("Warehouse not found", 404);

        // Check for items in warehouse before deleting (ON DELETE RESTRICT in DB)
        if (await db.AssetItems.AnyAsync(i => i.WarehouseId == warehouseId))
            throw new AppException("Cannot delete warehouse with asset items. Move items first.", 409);

        w.IsActive  = false;
        w.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }
}
