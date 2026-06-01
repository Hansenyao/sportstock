using Microsoft.EntityFrameworkCore;
using Npgsql;
using SportStock.Api.Data;
using SportStock.Api.Data.Entities;
using SportStock.Api.Dtos.AssetNames;
using SportStock.Api.Exceptions;

namespace SportStock.Api.Services;

// Ports backend/src/services/asset-name.service.ts 1:1.
//
// Two PG behaviors the EF Core LINQ has to reproduce exactly:
//   - list: LEFT JOIN asset_categories, plus COUNT(asset_types WHERE is_active=true) per row,
//     ordered by name. We compose this as projection subqueries off the AssetNames DbSet so
//     EF translates to the same single SELECT...GROUP BY shape.
//   - delete: a pre-check against active asset_types prevents accidental orphaning; the
//     existing FK is RESTRICT and would 23503 otherwise, but Node phrases the conflict as a
//     409 with a user-friendly message, which we preserve.
internal sealed class AssetNameService(SportStockDbContext db) : IAssetNameService
{
    public async Task<IReadOnlyList<AssetNameListItem>> ListAsync(Guid clubId, CancellationToken ct = default)
    {
        return await db.AssetNames
            .IgnoreQueryFilters()
            .Where(an => an.ClubId == clubId)
            .OrderBy(an => an.Name)
            .Select(an => new AssetNameListItem
            {
                Id = an.Id,
                ClubId = an.ClubId,
                Name = an.Name,
                CategoryId = an.CategoryId,
                CreatedAt = an.CreatedAt,
                CategoryName = an.Category != null ? an.Category.Name : null,
                TypeCount = db.AssetTypes.Count(at => at.AssetNameId == an.Id && at.IsActive),
            })
            .ToListAsync(ct);
    }

    public async Task<AssetNameDetail> CreateAsync(
        Guid clubId, CreateAssetNameRequest req, CancellationToken ct = default)
    {
        var name = req.Name.Trim();
        var entity = new AssetName
        {
            Id = Guid.NewGuid(),
            ClubId = clubId,
            Name = name,
            CategoryId = req.CategoryId,
        };
        db.AssetNames.Add(entity);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505" })
        {
            throw new AppException("Asset name already exists", 409);
        }
        return Map(entity);
    }

    public async Task<AssetNameDetail> UpdateAsync(
        Guid id, Guid clubId, UpdateAssetNameRequest req, CancellationToken ct = default)
    {
        var name = req.Name.Trim();
        var existing = await db.AssetNames
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(an => an.Id == id && an.ClubId == clubId, ct);
        if (existing is null) throw new AppException("Asset name not found", 404);

        existing.Name = name;
        existing.CategoryId = req.CategoryId;
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505" })
        {
            throw new AppException("Asset name already exists", 409);
        }
        return Map(existing);
    }

    public async Task DeleteAsync(Guid id, Guid clubId, CancellationToken ct = default)
    {
        var hasActiveType = await db.AssetTypes
            .IgnoreQueryFilters()
            .AnyAsync(at => at.AssetNameId == id && at.IsActive, ct);
        if (hasActiveType)
            throw new AppException("Cannot delete: active asset types are using this name", 409);

        var rows = await db.AssetNames
            .IgnoreQueryFilters()
            .Where(an => an.Id == id && an.ClubId == clubId)
            .ExecuteDeleteAsync(ct);
        if (rows == 0) throw new AppException("Asset name not found", 404);
    }

    private static AssetNameDetail Map(AssetName an) => new()
    {
        Id = an.Id,
        ClubId = an.ClubId,
        Name = an.Name,
        CategoryId = an.CategoryId,
        CreatedAt = an.CreatedAt,
    };
}
