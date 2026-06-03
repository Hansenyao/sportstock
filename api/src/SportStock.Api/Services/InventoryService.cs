using Microsoft.EntityFrameworkCore;
using SportStock.Api.Data;
using SportStock.Api.Data.Entities;
using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.Common;
using SportStock.Api.Dtos.Inventory;
using SportStock.Api.Exceptions;

namespace SportStock.Api.Services;

// Ports backend/src/services/inventory.service.ts.
// In v2, asset quantities and statuses live in asset_items rows.
// Stored procedures for retire/maintenance have been removed; all status
// transitions are performed inline via EF Core.
internal sealed class InventoryService(SportStockDbContext db) : IInventoryService
{
    private static readonly HashSet<string> ValidMovementTypeFilter = new(StringComparer.Ordinal)
    {
        "purchase", "loan_out", "loan_return", "write_off", "adjustment",
    };

    // ── Movements ────────────────────────────────────────────────────────────

    public async Task<PaginatedResult<MovementListItem>> ListMovementsAsync(
        Guid clubId, ListMovementsQuery query, CancellationToken ct = default)
    {
        if (query.Page < 1) query.Page = 1;
        if (query.Limit < 1) query.Limit = 20;

        StockMovementType? typeFilter = null;
        if (!string.IsNullOrWhiteSpace(query.Type))
        {
            if (!ValidMovementTypeFilter.Contains(query.Type))
                throw new AppException(
                    "type must be one of: purchase, loan_out, loan_return, write_off, adjustment", 400);
            typeFilter = query.Type switch
            {
                "purchase" => StockMovementType.Purchase,
                "loan_out" => StockMovementType.LoanOut,
                "loan_return" => StockMovementType.LoanReturn,
                "write_off" => StockMovementType.WriteOff,
                "adjustment" => StockMovementType.Adjustment,
                _ => null,
            };
        }

        IQueryable<StockMovement> source = db.StockMovements
            .IgnoreQueryFilters()
            .Where(sm => sm.ClubId == clubId);

        if (query.AssetTypeId is { } typeId)
            source = source.Where(sm =>
                sm.AssetBatch != null && sm.AssetBatch.AssetTypeId == typeId);

        if (typeFilter is { } tf)
            source = source.Where(sm => sm.Type == tf);

        if (query.FromDate is { } from)
            source = source.Where(sm => sm.CreatedAt >= from);

        if (query.ToDate is { } to)
            source = source.Where(sm => sm.CreatedAt < to);

        var total = await source.CountAsync(ct);

        var data = await source
            .OrderByDescending(sm => sm.CreatedAt)
            .Skip((query.Page - 1) * query.Limit)
            .Take(query.Limit)
            .Select(sm => new MovementListItem
            {
                Id = sm.Id,
                ClubId = sm.ClubId,
                AssetBatchId = sm.AssetBatchId,
                LoanId = sm.LoanId,
                LoanItemId = sm.LoanItemId,
                OperatorId = sm.OperatorId,
                Type = sm.Type,
                QuantityDelta = sm.QuantityDelta,
                QuantityBefore = sm.QuantityBefore,
                QuantityAfter = sm.QuantityAfter,
                Notes = sm.Notes,
                CreatedAt = sm.CreatedAt,
                AssetName = sm.AssetBatch != null && sm.AssetBatch.AssetType != null
                    ? sm.AssetBatch.AssetType.AssetName.Name : null,
                Brand = sm.AssetBatch != null && sm.AssetBatch.AssetType != null
                    ? sm.AssetBatch.AssetType.Brand : null,
                Model = sm.AssetBatch != null && sm.AssetBatch.AssetType != null
                    ? sm.AssetBatch.AssetType.Model : null,
                Size = sm.AssetBatch != null && sm.AssetBatch.AssetType != null
                    ? sm.AssetBatch.AssetType.Size : null,
                OperatorName = sm.Operator != null
                    ? sm.Operator.FirstName + " " + sm.Operator.LastName : null,
            })
            .ToListAsync(ct);

        return new PaginatedResult<MovementListItem>
        {
            Data = data,
            Total = total,
            Page = query.Page,
            Limit = query.Limit,
        };
    }

    // ── Adjust batch (add or remove asset_item rows) ──────────────────────────

    public async Task<AssetBatchResponse> AdjustBatchAsync(
        Guid clubId, Guid operatorId, Guid batchId, AdjustBatchRequest req, CancellationToken ct = default)
    {
        if (req.QuantityDelta is null)
            throw new AppException("quantity_delta is required", 400);

        var batch = await LoadBatchWithItemsAsync(batchId, clubId, ct);
        var delta = req.QuantityDelta.Value;

        if (delta > 0)
        {
            // Adding stock: need a warehouse to place new items in.
            var warehouseId = await db.Warehouses
                .IgnoreQueryFilters()
                .Where(w => w.ClubId == clubId && w.IsActive)
                .OrderBy(w => w.CreatedAt)
                .Select(w => (Guid?)w.Id)
                .FirstOrDefaultAsync(ct)
                ?? throw new AppException("No active warehouse found for this club", 409);

            await using var tx = await db.Database.BeginTransactionAsync(ct);

            var availableBefore = batch.AssetItems.Count(i => i.Status == AssetItemStatus.Available);

            for (int i = 0; i < delta; i++)
            {
                db.AssetItems.Add(new AssetItem
                {
                    Id          = Guid.NewGuid(),
                    ClubId      = clubId,
                    AssetTypeId = batch.AssetTypeId,
                    BatchId     = batchId,
                    WarehouseId = warehouseId,
                    Status      = AssetItemStatus.Available,
                });
            }

            batch.TotalQuantity += delta;
            batch.UpdatedAt = DateTime.UtcNow;

            db.StockMovements.Add(new StockMovement
            {
                Id = Guid.NewGuid(),
                ClubId = clubId,
                AssetBatchId = batchId,
                OperatorId = operatorId,
                Type = StockMovementType.Adjustment,
                QuantityDelta = delta,
                QuantityBefore = availableBefore,
                QuantityAfter = availableBefore + delta,
                Notes = req.Notes ?? "Manual adjustment (add)",
            });

            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        else if (delta < 0)
        {
            // Removing stock: retire that many available items.
            var toRemove = -delta;
            var availableItems = batch.AssetItems
                .Where(i => i.Status == AssetItemStatus.Available)
                .Take(toRemove)
                .ToList();

            if (availableItems.Count < toRemove)
                throw new AppException("Adjustment would result in negative available quantity", 409);

            await using var tx = await db.Database.BeginTransactionAsync(ct);

            var availableBefore = batch.AssetItems.Count(i => i.Status == AssetItemStatus.Available);

            foreach (var item in availableItems)
            {
                item.Status    = AssetItemStatus.WrittenOff;
                item.UpdatedAt = DateTime.UtcNow;
            }

            batch.TotalQuantity = Math.Max(batch.TotalQuantity + delta, 0);
            batch.UpdatedAt = DateTime.UtcNow;

            db.StockMovements.Add(new StockMovement
            {
                Id = Guid.NewGuid(),
                ClubId = clubId,
                AssetBatchId = batchId,
                OperatorId = operatorId,
                Type = StockMovementType.Adjustment,
                QuantityDelta = delta,
                QuantityBefore = availableBefore,
                QuantityAfter = availableBefore + delta,
                Notes = req.Notes ?? "Manual adjustment (remove)",
            });

            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }

        return await MapBatchAsync(batchId, ct);
    }

    // ── Retire batch (mark all available items as Retired) ───────────────────

    public async Task<AssetBatchResponse> RetireBatchAsync(
        Guid clubId, Guid operatorId, Guid batchId, RetireBatchRequest req, CancellationToken ct = default)
    {
        if (req.Quantity is null || req.Quantity < 1)
            throw new AppException("Positive quantity is required", 400);

        var batch = await LoadBatchWithItemsAsync(batchId, clubId, ct);

        var availableItems = batch.AssetItems
            .Where(i => i.Status == AssetItemStatus.Available)
            .Take(req.Quantity.Value)
            .ToList();

        if (availableItems.Count < req.Quantity.Value)
            throw new AppException(
                $"Cannot retire {req.Quantity.Value} items: only {availableItems.Count} available", 409);

        var availableBefore = batch.AssetItems.Count(i => i.Status == AssetItemStatus.Available);

        foreach (var item in availableItems)
        {
            item.Status    = AssetItemStatus.Retired;
            item.UpdatedAt = DateTime.UtcNow;
        }

        db.StockMovements.Add(new StockMovement
        {
            Id = Guid.NewGuid(),
            ClubId = clubId,
            AssetBatchId = batchId,
            OperatorId = operatorId,
            Type = StockMovementType.WriteOff,
            QuantityDelta = -req.Quantity.Value,
            QuantityBefore = availableBefore,
            QuantityAfter = availableBefore - req.Quantity.Value,
            Notes = req.Notes ?? "Retirement",
        });

        await db.SaveChangesAsync(ct);

        return await MapBatchAsync(batchId, ct);
    }

    // ── Complete maintenance (calls SP complete_maintenance) ────────────────

    public async Task<AssetBatchResponse> CompleteMaintenanceAsync(
        Guid clubId, Guid operatorId, Guid batchId, MaintenanceBatchRequest req, CancellationToken ct = default)
    {
        if (req.QuantityRestored is null)
            throw new AppException("quantity_restored is required", 400);

        var batch = await LoadBatchWithItemsAsync(batchId, clubId, ct);

        var maintenanceItems = batch.AssetItems
            .Where(i => i.Status == AssetItemStatus.Maintenance)
            .Take(req.QuantityRestored.Value)
            .ToList();

        if (maintenanceItems.Count < req.QuantityRestored.Value)
            throw new AppException(
                $"Cannot restore {req.QuantityRestored.Value} items: only {maintenanceItems.Count} in maintenance", 409);

        foreach (var item in maintenanceItems)
        {
            item.Status    = AssetItemStatus.Available;
            item.UpdatedAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync(ct);

        return await MapBatchAsync(batchId, ct);
    }

    // ── Stocktakes ───────────────────────────────────────────────────────────

    public async Task<IReadOnlyList<StocktakeSessionListItem>> ListStocktakesAsync(
        Guid clubId, int page, int limit, CancellationToken ct = default)
    {
        if (page < 1) page = 1;
        if (limit < 1) limit = 10;

        return await db.StocktakeSessions
            .IgnoreQueryFilters()
            .Where(s => s.ClubId == clubId)
            .OrderByDescending(s => s.StartedAt)
            .Skip((page - 1) * limit)
            .Take(limit)
            .Select(s => new StocktakeSessionListItem
            {
                Id = s.Id,
                ClubId = s.ClubId,
                ConductedBy = s.ConductedBy,
                Status = s.Status,
                Notes = s.Notes,
                StartedAt = s.StartedAt,
                CompletedAt = s.CompletedAt,
                CreatedAt = s.CreatedAt,
                ConductedByName = s.ConductedByNavigation != null
                    ? s.ConductedByNavigation.FirstName + " " + s.ConductedByNavigation.LastName : string.Empty,
            })
            .ToListAsync(ct);
    }

    public async Task<StocktakeSessionListItem> CreateStocktakeAsync(
        Guid clubId, Guid conductedBy, CreateStocktakeRequest req, CancellationToken ct = default)
    {
        var session = new StocktakeSession
        {
            Id = Guid.NewGuid(),
            ClubId = clubId,
            ConductedBy = conductedBy,
            Status = "in_progress",
            Notes = req.Notes,
        };
        db.StocktakeSessions.Add(session);
        await db.SaveChangesAsync(ct);

        var conductedByName = await db.Users
            .IgnoreQueryFilters()
            .Where(u => u.Id == conductedBy)
            .Select(u => u.FirstName + " " + u.LastName)
            .FirstAsync(ct);

        return new StocktakeSessionListItem
        {
            Id = session.Id,
            ClubId = session.ClubId,
            ConductedBy = session.ConductedBy,
            Status = session.Status,
            Notes = session.Notes,
            StartedAt = session.StartedAt,
            CompletedAt = session.CompletedAt,
            CreatedAt = session.CreatedAt,
            ConductedByName = conductedByName,
        };
    }

    public async Task<StocktakeSessionDetailResponse> GetStocktakeAsync(
        Guid sessionId, Guid clubId, CancellationToken ct = default)
    {
        var session = await db.StocktakeSessions
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.Id == sessionId && s.ClubId == clubId, ct);
        if (session is null) throw new AppException("Stocktake session not found", 404);

        // Live count of available asset_items per asset_type — used for the
        // items[].current_quantity column.
        var items = await db.StocktakeItems
            .IgnoreQueryFilters()
            .Where(si => si.SessionId == sessionId)
            .OrderBy(si => si.AssetType.AssetName.Name)
            .Select(si => new StocktakeItemInfo
            {
                Id = si.Id,
                SessionId = si.SessionId,
                AssetTypeId = si.AssetTypeId,
                SystemQuantity = si.SystemQuantity,
                PhysicalQuantity = si.PhysicalQuantity,
                Variance = si.Variance,
                Notes = si.Notes,
                CreatedAt = si.CreatedAt,
                AssetName = si.AssetType.AssetName.Name,
                Brand = si.AssetType.Brand,
                Model = si.AssetType.Model,
                Size = si.AssetType.Size,
                CurrentQuantity = db.AssetItems
                    .Count(ai => ai.AssetTypeId == si.AssetTypeId
                              && ai.Status == AssetItemStatus.Available),
            })
            .ToListAsync(ct);

        return new StocktakeSessionDetailResponse
        {
            Id = session.Id,
            ClubId = session.ClubId,
            ConductedBy = session.ConductedBy,
            Status = session.Status,
            Notes = session.Notes,
            StartedAt = session.StartedAt,
            CompletedAt = session.CompletedAt,
            CreatedAt = session.CreatedAt,
            Items = items,
        };
    }

    public async Task<StocktakeSessionListItem> UpdateStocktakeAsync(
        Guid sessionId, Guid clubId, UpdateStocktakeRequest req, CancellationToken ct = default)
    {
        var session = await db.StocktakeSessions
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.Id == sessionId && s.ClubId == clubId, ct);
        if (session is null) throw new AppException("Stocktake session not found", 404);
        if (session.Status != "in_progress")
            throw new AppException("Session is not in progress", 409);

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        if (req.Items is { Count: > 0 })
        {
            foreach (var input in req.Items)
            {
                if (input.AssetTypeId is null || input.PhysicalQuantity is null) continue;

                // Verify the asset_type belongs to this club AND get live available count.
                var assetTypeExists = await db.AssetTypes
                    .IgnoreQueryFilters()
                    .AnyAsync(at => at.Id == input.AssetTypeId.Value
                                 && at.ClubId == clubId
                                 && at.IsActive, ct);

                if (!assetTypeExists) continue; // type not in this club / inactive

                var systemQty = await db.AssetItems
                    .IgnoreQueryFilters()
                    .CountAsync(ai => ai.AssetTypeId == input.AssetTypeId.Value
                                   && ai.Status == AssetItemStatus.Available, ct);

                // Upsert: query existing row first, then either update or insert.
                var existing = await db.StocktakeItems
                    .IgnoreQueryFilters()
                    .FirstOrDefaultAsync(si =>
                        si.SessionId == sessionId && si.AssetTypeId == input.AssetTypeId.Value, ct);

                if (existing is null)
                {
                    db.StocktakeItems.Add(new StocktakeItem
                    {
                        Id = Guid.NewGuid(),
                        SessionId = sessionId,
                        AssetTypeId = input.AssetTypeId.Value,
                        SystemQuantity = systemQty,
                        PhysicalQuantity = input.PhysicalQuantity.Value,
                        Notes = input.Notes,
                    });
                }
                else
                {
                    existing.PhysicalQuantity = input.PhysicalQuantity.Value;
                    existing.Notes = input.Notes;
                }
                await db.SaveChangesAsync(ct);
            }
        }

        if (req.Status is "completed" or "cancelled")
        {
            session.Status = req.Status;
            session.CompletedAt = DateTime.UtcNow;
            if (req.Notes is not null) session.Notes = req.Notes;
            await db.SaveChangesAsync(ct);
        }

        await tx.CommitAsync(ct);

        var conductedByName = await db.Users
            .IgnoreQueryFilters()
            .Where(u => u.Id == session.ConductedBy)
            .Select(u => u.FirstName + " " + u.LastName)
            .FirstAsync(ct);

        return new StocktakeSessionListItem
        {
            Id = session.Id,
            ClubId = session.ClubId,
            ConductedBy = session.ConductedBy,
            Status = session.Status,
            Notes = session.Notes,
            StartedAt = session.StartedAt,
            CompletedAt = session.CompletedAt,
            CreatedAt = session.CreatedAt,
            ConductedByName = conductedByName,
        };
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private async Task<AssetBatch> LoadBatchWithItemsAsync(Guid batchId, Guid clubId, CancellationToken ct)
    {
        var batch = await db.AssetBatches
            .IgnoreQueryFilters()
            .Include(b => b.AssetItems)
            .Include(b => b.AssetType)
            .FirstOrDefaultAsync(b => b.Id == batchId && b.AssetType.ClubId == clubId, ct);
        return batch ?? throw new AppException("Batch not found", 404);
    }

    // Map batch to response DTO, computing item-level counts from asset_items.
    private async Task<AssetBatchResponse> MapBatchAsync(Guid batchId, CancellationToken ct)
    {
        var batch = await db.AssetBatches
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Include(b => b.AssetItems)
            .FirstAsync(b => b.Id == batchId, ct);

        return new AssetBatchResponse
        {
            Id              = batch.Id,
            AssetTypeId     = batch.AssetTypeId,
            PurchaseDate    = batch.PurchaseDate,
            PurchasePrice   = batch.PurchasePrice,
            UsefulLifeYears = batch.UsefulLifeYears,
            TotalQuantity   = batch.TotalQuantity,
            AvailableCount  = batch.AssetItems.Count(i => i.Status == AssetItemStatus.Available),
            OnLoanCount     = batch.AssetItems.Count(i => i.Status == AssetItemStatus.OnLoan),
            MaintenanceCount = batch.AssetItems.Count(i => i.Status == AssetItemStatus.Maintenance),
            RetiredCount    = batch.AssetItems.Count(i => i.Status == AssetItemStatus.Retired),
            Notes           = batch.Notes,
            CreatedAt       = batch.CreatedAt,
            UpdatedAt       = batch.UpdatedAt,
        };
    }
}
