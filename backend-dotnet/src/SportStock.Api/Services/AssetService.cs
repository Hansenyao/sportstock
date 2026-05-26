using System.Linq.Expressions;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using SportStock.Api.Data;
using SportStock.Api.Data.Entities;
using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.Assets;
using SportStock.Api.Dtos.Common;
using SportStock.Api.Exceptions;
using SportStock.Api.Integrations;

namespace SportStock.Api.Services;

// Ports backend/src/services/asset.service.ts.
//
// Two structural choices worth flagging:
//   - The aggregated TYPE_SELECT projection in Node ships as a single
//     hand-rolled SQL string with JSON_BUILD_OBJECT for the batches[] array.
//     Here we use EF Core LINQ projection that loads batches as a sub-
//     collection and serializes them via the global JSON pipeline. Wire shape
//     ends up identical (snake_case keys, ISO dates, snake_case enum values)
//     but the SQL itself is different — DO NOT depend on byte-for-byte
//     query-plan parity, only on byte-for-byte JSON response parity.
//   - For status filtering the computed type-level Status is a string derived
//     from aggregate predicates. EF Core does push it down to a HAVING-style
//     subquery filter; if a future workload shows this regresses, lift the
//     status filter into a CASE expression mapped via FromSqlInterpolated.
internal sealed class AssetService(
    SportStockDbContext db,
    ISupabaseStorage storage) : IAssetService
{
    private static readonly HashSet<string> ValidStatusFilter = new(StringComparer.Ordinal)
    {
        "available", "on_loan", "retired",
    };

    private static readonly HashSet<string> ValidBatchStatus = new(StringComparer.Ordinal)
    {
        "available", "on_loan", "maintenance", "retired",
    };

    // ── Categories ───────────────────────────────────────────────────────────

    public async Task<IReadOnlyList<CategoryResponse>> ListCategoriesAsync(
        Guid clubId, CancellationToken ct = default)
    {
        return await db.AssetCategories
            .IgnoreQueryFilters()
            .Where(c => c.ClubId == null || c.ClubId == clubId)
            .OrderByDescending(c => c.IsSystem)
            .ThenBy(c => c.Name)
            .Select(c => new CategoryResponse
            {
                Id = c.Id,
                ClubId = c.ClubId,
                Name = c.Name,
                IsSystem = c.IsSystem,
                CreatedAt = c.CreatedAt,
            })
            .ToListAsync(ct);
    }

    public async Task<CategoryResponse> CreateCategoryAsync(
        Guid clubId, CreateCategoryRequest req, CancellationToken ct = default)
    {
        var entity = new AssetCategory
        {
            Id = Guid.NewGuid(),
            ClubId = clubId,
            Name = req.Name.Trim(),
            IsSystem = false,
        };
        db.AssetCategories.Add(entity);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505" })
        {
            throw new AppException("Category name already exists", 409);
        }

        return new CategoryResponse
        {
            Id = entity.Id,
            ClubId = entity.ClubId,
            Name = entity.Name,
            IsSystem = entity.IsSystem,
            CreatedAt = entity.CreatedAt,
        };
    }

    // ── Assets (list/get) ────────────────────────────────────────────────────

    public async Task<PaginatedResult<AssetTypeResponse>> ListAsync(
        Guid clubId, ListAssetsQuery query, CancellationToken ct = default)
    {
        if (query.Page < 1) query.Page = 1;
        if (query.Limit < 1) query.Limit = 20;

        if (query.Status is not null && !ValidStatusFilter.Contains(query.Status))
            throw new AppException("status must be one of: available, on_loan, retired", 400);

        IQueryable<AssetType> source = db.AssetTypes
            .IgnoreQueryFilters()
            .Where(at => at.ClubId == clubId && at.IsActive);

        if (query.CategoryId is { } catId)
            source = source.Where(at => at.AssetName.CategoryId == catId);

        if (!string.IsNullOrWhiteSpace(query.Search))
            source = source.Where(at => EF.Functions.ILike(at.AssetName.Name, $"%{query.Search}%"));

        IQueryable<AssetTypeResponse> projected = source
            .OrderBy(at => at.AssetName.Name)
            .ThenBy(at => at.Brand)
            .Select(MapExpr);

        if (query.Status is not null)
            projected = projected.Where(p => p.Status == query.Status);

        var total = await projected.CountAsync(ct);
        var data = await projected
            .Skip((query.Page - 1) * query.Limit)
            .Take(query.Limit)
            .ToListAsync(ct);

        return new PaginatedResult<AssetTypeResponse>
        {
            Data = data,
            Total = total,
            Page = query.Page,
            Limit = query.Limit,
        };
    }

    public async Task<AssetTypeResponse> GetAsync(
        Guid typeId, Guid clubId, CancellationToken ct = default)
    {
        var row = await db.AssetTypes
            .IgnoreQueryFilters()
            .Where(at => at.Id == typeId && at.ClubId == clubId && at.IsActive)
            .Select(MapExpr)
            .FirstOrDefaultAsync(ct);

        return row ?? throw new AppException("Asset not found", 404);
    }

    // ── Create asset_type + first batch ──────────────────────────────────────

    public async Task<AssetTypeResponse> CreateAsync(
        Guid clubId, Guid operatorId, CreateAssetRequest req, CancellationToken ct = default)
    {
        if (req.AssetNameId is null)
            throw new AppException("asset_name_id is required", 400);
        var qty = req.TotalQuantity ?? 1;
        if (qty < 1)
            throw new AppException("total_quantity must be at least 1", 400);

        // Verify asset_name belongs to this club.
        var nameExists = await db.AssetNames
            .IgnoreQueryFilters()
            .AnyAsync(an => an.Id == req.AssetNameId.Value && an.ClubId == clubId, ct);
        if (!nameExists)
            throw new AppException("Asset name not found in this club", 404);

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        // Find-or-create asset_type. COALESCE(field,'') equality so NULL ↔ NULL
        // and NULL ↔ '' match Node behavior exactly.
        var existing = await db.AssetTypes
            .IgnoreQueryFilters()
            .Where(at =>
                at.ClubId == clubId
                && at.AssetNameId == req.AssetNameId.Value
                && (at.Brand ?? string.Empty) == (req.Brand ?? string.Empty)
                && (at.Model ?? string.Empty) == (req.Model ?? string.Empty)
                && (at.Size ?? string.Empty) == (req.Size ?? string.Empty)
                && at.IsActive)
            .FirstOrDefaultAsync(ct);

        Guid typeId;
        if (existing is not null)
        {
            typeId = existing.Id;
            if (req.LowStockThreshold is not null)
            {
                existing.LowStockThreshold = req.LowStockThreshold;
                existing.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync(ct);
            }
        }
        else
        {
            var type = new AssetType
            {
                Id = Guid.NewGuid(),
                ClubId = clubId,
                AssetNameId = req.AssetNameId.Value,
                Brand = req.Brand,
                Model = req.Model,
                Size = req.Size,
                LowStockThreshold = req.LowStockThreshold,
                IsActive = true,
            };
            db.AssetTypes.Add(type);
            await db.SaveChangesAsync(ct);
            typeId = type.Id;
        }

        var batch = new AssetBatch
        {
            Id = Guid.NewGuid(),
            AssetTypeId = typeId,
            PurchaseDate = req.PurchaseDate,
            PurchasePrice = req.PurchasePrice,
            UsefulLifeYears = req.UsefulLifeYears,
            TotalQuantity = qty,
            AvailableQuantity = qty,
            Status = AssetStatus.Available,
            Notes = req.Notes,
        };
        db.AssetBatches.Add(batch);
        await db.SaveChangesAsync(ct);

        db.StockMovements.Add(new StockMovement
        {
            Id = Guid.NewGuid(),
            ClubId = clubId,
            AssetBatchId = batch.Id,
            OperatorId = operatorId,
            Type = StockMovementType.Purchase,
            QuantityDelta = qty,
            QuantityBefore = 0,
            QuantityAfter = qty,
            Notes = "Initial stock entry",
        });
        await db.SaveChangesAsync(ct);

        await tx.CommitAsync(ct);

        return await GetAsync(typeId, clubId, ct);
    }

    // ── Update type-level fields ─────────────────────────────────────────────

    public async Task<AssetTypeResponse> UpdateAsync(
        Guid typeId, Guid clubId, UpdateAssetRequest req, CancellationToken ct = default)
    {
        if (req.AssetNameId is { } nameId)
        {
            var ok = await db.AssetNames
                .IgnoreQueryFilters()
                .AnyAsync(an => an.Id == nameId && an.ClubId == clubId, ct);
            if (!ok) throw new AppException("Asset name not found in this club", 404);
        }

        var type = await db.AssetTypes
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(at => at.Id == typeId && at.ClubId == clubId && at.IsActive, ct);
        if (type is null) throw new AppException("Asset not found", 404);

        if (req.AssetNameId is { } newName) type.AssetNameId = newName;
        ApplyNullableString(req.Brand, v => type.Brand = v);
        ApplyNullableString(req.Model, v => type.Model = v);
        ApplyNullableString(req.Size, v => type.Size = v);
        ApplyNullableInt(req.LowStockThreshold, v => type.LowStockThreshold = v);
        type.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);

        return await GetAsync(typeId, clubId, ct);
    }

    // ── Soft delete ──────────────────────────────────────────────────────────

    public async Task DeleteAsync(Guid typeId, Guid clubId, CancellationToken ct = default)
    {
        var activeLoanCount = await (
            from li in db.LoanItems
            join l in db.Loans.IgnoreQueryFilters() on li.LoanId equals l.Id
            where li.AssetTypeId == typeId
                  && l.Status != LoanStatus.Returned
                  && l.Status != LoanStatus.Rejected
            select li.Id
        ).CountAsync(ct);
        if (activeLoanCount > 0)
            throw new AppException("Cannot delete: asset has active or pending loans", 409);

        var rows = await db.AssetTypes
            .IgnoreQueryFilters()
            .Where(at => at.Id == typeId && at.ClubId == clubId)
            .ExecuteUpdateAsync(s => s
                .SetProperty(at => at.IsActive, false)
                .SetProperty(at => at.UpdatedAt, DateTime.UtcNow), ct);
        if (rows == 0) throw new AppException("Asset not found", 404);
    }

    // ── Image upload ─────────────────────────────────────────────────────────

    public async Task<UploadImageResponse> UploadImageAsync(
        Guid typeId, Guid clubId, Stream content, string contentType, string fileName,
        CancellationToken ct = default)
    {
        var ext = Path.GetExtension(fileName).TrimStart('.');
        if (string.IsNullOrWhiteSpace(ext)) ext = "bin";
        var path = $"assets/{clubId}/{typeId}_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}.{ext}";

        var url = await storage.UploadAsync(path, content, contentType, ct);

        var rows = await db.AssetTypes
            .IgnoreQueryFilters()
            .Where(at => at.Id == typeId && at.ClubId == clubId)
            .ExecuteUpdateAsync(s => s
                .SetProperty(at => at.ImageUrl, url)
                .SetProperty(at => at.UpdatedAt, DateTime.UtcNow), ct);
        if (rows == 0) throw new AppException("Asset not found", 404);

        return new UploadImageResponse { Id = typeId, ImageUrl = url };
    }

    // ── Batches ──────────────────────────────────────────────────────────────

    public async Task<AssetTypeResponse> AddBatchAsync(
        Guid typeId, Guid clubId, Guid operatorId, CreateBatchRequest req, CancellationToken ct = default)
    {
        var qty = req.TotalQuantity ?? 1;
        if (qty < 1)
            throw new AppException("total_quantity must be at least 1", 400);

        var typeOk = await db.AssetTypes
            .IgnoreQueryFilters()
            .AnyAsync(at => at.Id == typeId && at.ClubId == clubId && at.IsActive, ct);
        if (!typeOk) throw new AppException("Asset not found", 404);

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        var batch = new AssetBatch
        {
            Id = Guid.NewGuid(),
            AssetTypeId = typeId,
            PurchaseDate = req.PurchaseDate,
            PurchasePrice = req.PurchasePrice,
            UsefulLifeYears = req.UsefulLifeYears,
            TotalQuantity = qty,
            AvailableQuantity = qty,
            Status = AssetStatus.Available,
            Notes = req.Notes,
        };
        db.AssetBatches.Add(batch);
        await db.SaveChangesAsync(ct);

        db.StockMovements.Add(new StockMovement
        {
            Id = Guid.NewGuid(),
            ClubId = clubId,
            AssetBatchId = batch.Id,
            OperatorId = operatorId,
            Type = StockMovementType.Purchase,
            QuantityDelta = qty,
            QuantityBefore = 0,
            QuantityAfter = qty,
            Notes = "New batch purchased",
        });
        await db.SaveChangesAsync(ct);

        await tx.CommitAsync(ct);

        return await GetAsync(typeId, clubId, ct);
    }

    public async Task<AssetTypeResponse> UpdateBatchAsync(
        Guid batchId, Guid typeId, Guid clubId, UpdateBatchRequest req, CancellationToken ct = default)
    {
        var batch = await (
            from b in db.AssetBatches.IgnoreQueryFilters()
            join at in db.AssetTypes.IgnoreQueryFilters() on b.AssetTypeId equals at.Id
            where b.Id == batchId && b.AssetTypeId == typeId && at.ClubId == clubId
            select b
        ).FirstOrDefaultAsync(ct);
        if (batch is null) throw new AppException("Batch not found", 404);

        ApplyNullableDate(req.PurchaseDate, v => batch.PurchaseDate = v);
        ApplyNullableDecimal(req.PurchasePrice, v => batch.PurchasePrice = v);
        ApplyNullableInt(req.UsefulLifeYears, v => batch.UsefulLifeYears = v);
        ApplyNullableString(req.Notes, v => batch.Notes = v);

        if (req.Status is not null)
        {
            if (!ValidBatchStatus.Contains(req.Status))
                throw new AppException("Invalid batch status", 400);
            batch.Status = req.Status switch
            {
                "available" => AssetStatus.Available,
                "on_loan" => AssetStatus.OnLoan,
                "maintenance" => AssetStatus.Maintenance,
                "retired" => AssetStatus.Retired,
                _ => batch.Status,
            };
        }
        batch.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);
        return await GetAsync(typeId, clubId, ct);
    }

    // ── Depreciation ─────────────────────────────────────────────────────────

    public async Task<DepreciationResponse> GetDepreciationAsync(
        Guid batchId, Guid clubId, CancellationToken ct = default)
    {
        var batchOk = await (
            from b in db.AssetBatches.IgnoreQueryFilters()
            join at in db.AssetTypes.IgnoreQueryFilters() on b.AssetTypeId equals at.Id
            where b.Id == batchId && at.ClubId == clubId
            select b.Id
        ).AnyAsync(ct);
        if (!batchOk) throw new AppException("Batch not found", 404);

        var rows = await db.GetAssetDepreciationAsync(batchId, ct);
        if (rows.Count == 0)
            throw new AppException(
                "Batch is missing purchase_price, purchase_date, or useful_life_years", 422);

        var row = rows[0];
        return new DepreciationResponse
        {
            BatchId = row.BatchId,
            AssetTypeId = row.AssetTypeId,
            PurchasePrice = row.PurchasePrice,
            AnnualDepreciation = row.AnnualDepreciation,
            YearsElapsed = row.YearsElapsed,
            AccumulatedDepreciation = row.AccumulatedDepreciation,
            NetBookValue = row.NetBookValue,
        };
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    // EF Core 10 cannot translate a static helper *method* invocation inside a
    // Select() — it falls back to client-side eval, materializes AssetType
    // without nav-props, and NREs on at.AssetName.Name. Declaring the
    // projection as an Expression<Func<...>> keeps it server-translatable: the
    // tree is rewritten into a single SELECT with the necessary joins.
    private static readonly Expression<Func<AssetType, AssetTypeResponse>> MapExpr = at => new AssetTypeResponse
    {
        Id = at.Id,
        ClubId = at.ClubId,
        AssetNameId = at.AssetNameId,
        Name = at.AssetName.Name,
        CategoryId = at.AssetName.CategoryId,
        CategoryName = at.AssetName.Category != null ? at.AssetName.Category.Name : null,
        Brand = at.Brand,
        Model = at.Model,
        Size = at.Size,
        ImageUrl = at.ImageUrl,
        LowStockThreshold = at.LowStockThreshold,
        IsActive = at.IsActive,
        CreatedAt = at.CreatedAt,
        UpdatedAt = at.UpdatedAt,
        TotalQuantity = at.AssetBatches.Sum(b => (int?)b.TotalQuantity) ?? 0,
        AvailableQuantity = at.AssetBatches.Sum(b => (int?)b.AvailableQuantity) ?? 0,
        BatchCount = at.AssetBatches.Count(),
        Status = at.AssetBatches.Count() == 0
                 || at.AssetBatches.Sum(b => (int?)b.TotalQuantity) == 0
                    ? "retired"
                    : at.AssetBatches.Sum(b => (int?)b.AvailableQuantity) == 0
                        ? "on_loan"
                        : "available",
        Batches = at.AssetBatches
            .OrderBy(b => b.PurchaseDate)
            .ThenBy(b => b.CreatedAt)
            .Select(b => new BatchInfo
            {
                Id = b.Id,
                PurchaseDate = b.PurchaseDate,
                PurchasePrice = b.PurchasePrice,
                UsefulLifeYears = b.UsefulLifeYears,
                TotalQuantity = b.TotalQuantity,
                AvailableQuantity = b.AvailableQuantity,
                Status = b.Status,
                Notes = b.Notes,
                CreatedAt = b.CreatedAt,
            })
            .ToList(),
    };

    // JsonElement-based "present + null" semantics. The Node service treats
    // `undefined` as no-op and `null` as "clear the column"; we replicate that
    // by leaving the property unchanged when the wrapper has no value
    // (`null`), and writing null/the typed value when it does.
    private static void ApplyNullableString(JsonElement? el, Action<string?> set)
    {
        if (el is null) return;
        var v = el.Value;
        if (v.ValueKind == JsonValueKind.Null) { set(null); return; }
        if (v.ValueKind == JsonValueKind.String) { set(v.GetString()); return; }
        throw new AppException("Expected string or null", 400);
    }

    private static void ApplyNullableInt(JsonElement? el, Action<int?> set)
    {
        if (el is null) return;
        var v = el.Value;
        if (v.ValueKind == JsonValueKind.Null) { set(null); return; }
        if (v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var n)) { set(n); return; }
        throw new AppException("Expected integer or null", 400);
    }

    private static void ApplyNullableDecimal(JsonElement? el, Action<decimal?> set)
    {
        if (el is null) return;
        var v = el.Value;
        if (v.ValueKind == JsonValueKind.Null) { set(null); return; }
        if (v.ValueKind == JsonValueKind.Number && v.TryGetDecimal(out var d)) { set(d); return; }
        if (v.ValueKind == JsonValueKind.String && decimal.TryParse(v.GetString(), out d)) { set(d); return; }
        throw new AppException("Expected number or null", 400);
    }

    private static void ApplyNullableDate(JsonElement? el, Action<DateOnly?> set)
    {
        if (el is null) return;
        var v = el.Value;
        if (v.ValueKind == JsonValueKind.Null) { set(null); return; }
        if (v.ValueKind == JsonValueKind.String && DateOnly.TryParse(v.GetString(), out var d)) { set(d); return; }
        throw new AppException("Expected ISO date or null", 400);
    }
}
