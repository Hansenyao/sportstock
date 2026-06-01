using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using SportStock.Api.Data;
using SportStock.Api.Data.Entities;
using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.Common;
using SportStock.Api.Dtos.WriteOffs;
using SportStock.Api.Exceptions;

namespace SportStock.Api.Services;

// Ports backend/src/services/write-off.service.ts. Manual write-offs from
// /write-offs use FIFO batch deduction; the loan-driven write-offs created
// by LoanService.ConfirmReturn flow through a different code path and are
// not touched here.
internal sealed class WriteOffService(SportStockDbContext db) : IWriteOffService
{
    private static readonly HashSet<string> ValidSourceFilter = new(StringComparer.Ordinal)
    {
        "manual", "loan_return", "loan_lost",
    };

    private static readonly Expression<Func<WriteOffOrder, WriteOffResponse>> Projection = w => new WriteOffResponse
    {
        Id = w.Id,
        ClubId = w.ClubId,
        AssetTypeId = w.AssetTypeId,
        Quantity = w.Quantity,
        Reason = w.Reason,
        Source = w.Source,
        LoanItemId = w.LoanItemId,
        CreatedBy = w.CreatedBy,
        Notes = w.Notes,
        CreatedAt = w.CreatedAt,
        UpdatedAt = w.UpdatedAt,
        AssetName = w.AssetType.AssetName.Name,
        AssetImage = w.AssetType.ImageUrl,
        Brand = w.AssetType.Brand,
        Model = w.AssetType.Model,
        Size = w.AssetType.Size,
        CreatedByName = w.CreatedByNavigation.Name,
    };

    public async Task<PaginatedResult<WriteOffResponse>> ListAsync(
        Guid clubId, ListWriteOffsQuery query, CancellationToken ct = default)
    {
        if (query.Page < 1) query.Page = 1;
        if (query.Limit < 1) query.Limit = 20;

        WriteOffSource? sourceFilter = null;
        if (!string.IsNullOrWhiteSpace(query.Source))
        {
            if (!ValidSourceFilter.Contains(query.Source))
                throw new AppException(
                    "source must be one of: manual, loan_return, loan_lost", 400);
            sourceFilter = query.Source switch
            {
                "manual" => WriteOffSource.Manual,
                "loan_return" => WriteOffSource.LoanReturn,
                "loan_lost" => WriteOffSource.LoanLost,
                _ => null,
            };
        }

        IQueryable<WriteOffOrder> source = db.WriteOffOrders
            .IgnoreQueryFilters()
            .Where(w => w.ClubId == clubId);

        if (query.AssetTypeId is { } typeId)
            source = source.Where(w => w.AssetTypeId == typeId);
        if (sourceFilter is { } sf)
            source = source.Where(w => w.Source == sf);
        if (query.FromDate is { } from)
            source = source.Where(w => w.CreatedAt >= from);
        if (query.ToDate is { } to)
            source = source.Where(w => w.CreatedAt < to);

        var total = await source.CountAsync(ct);
        var data = await source
            .OrderByDescending(w => w.CreatedAt)
            .Skip((query.Page - 1) * query.Limit)
            .Take(query.Limit)
            .Select(Projection)
            .ToListAsync(ct);

        return new PaginatedResult<WriteOffResponse>
        {
            Data = data,
            Total = total,
            Page = query.Page,
            Limit = query.Limit,
        };
    }

    public async Task<WriteOffResponse> GetAsync(Guid id, Guid clubId, CancellationToken ct = default)
    {
        var row = await db.WriteOffOrders
            .IgnoreQueryFilters()
            .Where(w => w.Id == id && w.ClubId == clubId)
            .Select(Projection)
            .FirstOrDefaultAsync(ct);
        return row ?? throw new AppException("Write-off order not found", 404);
    }

    public async Task<WriteOffResponse> CreateAsync(
        Guid clubId, Guid operatorId, CreateWriteOffRequest req, CancellationToken ct = default)
    {
        if (req.AssetTypeId is null)
            throw new AppException("asset_type_id is required", 400);
        if (req.Quantity is null || req.Quantity < 1)
            throw new AppException("quantity must be at least 1", 400);

        var qty = req.Quantity.Value;
        var typeId = req.AssetTypeId.Value;

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        // FIFO across batches: oldest purchase_date first, NULLs last.
        var batches = await (
            from b in db.AssetBatches.IgnoreQueryFilters()
            join at in db.AssetTypes.IgnoreQueryFilters() on b.AssetTypeId equals at.Id
            where b.AssetTypeId == typeId
                  && at.ClubId == clubId
                  && b.AvailableQuantity > 0
                  && b.Status != AssetStatus.Retired
            orderby b.PurchaseDate ?? DateOnly.MaxValue, b.CreatedAt
            select b
        ).ToListAsync(ct);

        if (batches.Count == 0)
            throw new AppException("Asset not found or no available stock", 404);

        var totalAvail = batches.Sum(b => b.AvailableQuantity);
        if (qty > totalAvail)
            throw new AppException(
                $"Cannot write off {qty} units; only {totalAvail} available in stock", 409);

        var remaining = qty;
        var movementNote = req.Reason ?? "Manual write-off";
        foreach (var batch in batches)
        {
            if (remaining <= 0) break;
            var deduct = Math.Min(remaining, batch.AvailableQuantity);
            remaining -= deduct;
            var availBefore = batch.AvailableQuantity;

            batch.AvailableQuantity -= deduct;
            batch.TotalQuantity -= deduct;
            batch.UpdatedAt = DateTime.UtcNow;

            db.StockMovements.Add(new StockMovement
            {
                Id = Guid.NewGuid(),
                ClubId = clubId,
                AssetBatchId = batch.Id,
                OperatorId = operatorId,
                Type = StockMovementType.WriteOff,
                QuantityDelta = -deduct,
                QuantityBefore = availBefore,
                QuantityAfter = availBefore - deduct,
                Notes = movementNote,
            });
        }

        var order = new WriteOffOrder
        {
            Id = Guid.NewGuid(),
            ClubId = clubId,
            AssetTypeId = typeId,
            Quantity = qty,
            Reason = req.Reason,
            Source = WriteOffSource.Manual,
            CreatedBy = operatorId,
            Notes = req.Notes,
        };
        db.WriteOffOrders.Add(order);

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return await GetAsync(order.Id, clubId, ct);
    }
}
