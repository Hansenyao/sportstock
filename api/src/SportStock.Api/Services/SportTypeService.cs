using Microsoft.EntityFrameworkCore;
using SportStock.Api.Data;
using SportStock.Api.Data.Entities;
using SportStock.Api.Dtos.SportType;
using SportStock.Api.Exceptions;

namespace SportStock.Api.Services;

public sealed class SportTypeService(SportStockDbContext db) : ISportTypeService
{
    public async Task<List<SportTypeDto>> ListActiveAsync()
        => await db.SportTypes
            .Where(s => s.IsActive)
            .OrderBy(s => s.SortOrder).ThenBy(s => s.Name)
            .Select(s => new SportTypeDto(s.Id, s.Name, s.SortOrder, s.IsActive))
            .ToListAsync();

    public async Task<List<SportTypeDto>> ListAllAsync()
        => await db.SportTypes
            .OrderBy(s => s.SortOrder).ThenBy(s => s.Name)
            .Select(s => new SportTypeDto(s.Id, s.Name, s.SortOrder, s.IsActive))
            .ToListAsync();

    public async Task<SportTypeDto> CreateAsync(CreateSportTypeRequest req)
    {
        if (await db.SportTypes.AnyAsync(s => s.Name == req.Name))
            throw new AppException("Sport type already exists", 409);

        var st = new SportType
        {
            Id        = Guid.NewGuid(),
            Name      = req.Name,
            SortOrder = req.SortOrder,
            IsActive  = true,
        };
        db.SportTypes.Add(st);
        await db.SaveChangesAsync();
        return new SportTypeDto(st.Id, st.Name, st.SortOrder, st.IsActive);
    }

    public async Task UpdateAsync(Guid id, UpdateSportTypeRequest req)
    {
        var st = await db.SportTypes.FindAsync(id)
            ?? throw new AppException("Sport type not found", 404);

        if (req.Name != st.Name && await db.SportTypes.AnyAsync(s => s.Name == req.Name))
            throw new AppException("Sport type name already exists", 409);

        st.Name      = req.Name;
        st.SortOrder = req.SortOrder;
        st.IsActive  = req.IsActive;
        st.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }

    public async Task DeleteAsync(Guid id)
    {
        var st = await db.SportTypes.FindAsync(id)
            ?? throw new AppException("Sport type not found", 404);

        // Soft-delete: clubs referencing it keep sport_type_id (ON DELETE SET NULL handles hard deletes)
        st.IsActive  = false;
        st.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }
}
