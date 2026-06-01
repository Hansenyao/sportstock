using Microsoft.EntityFrameworkCore;
using Npgsql;
using SportStock.Api.Data;
using SportStock.Api.Data.Entities;
using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.Common;
using SportStock.Api.Dtos.Inventory;
using SportStock.Api.Exceptions;

namespace SportStock.Api.Services;

// Ports backend/src/services/inventory.service.ts. First service to call
// stored procedures via StoredProcedures.* extension methods; PG `RAISE
// EXCEPTION` from inside a CALL surfaces as PostgresException SqlState
// "P0001" (raise_exception). We translate those to AppException with the
// 409 status code Node assigned to "Cannot retire ..." and "not in
// maintenance status ..." business-rule violations.
internal sealed class InventoryService(SportStockDbContext db) : IInventoryService
{
    // PG raise_exception SqlState. Used to distinguish business-rule
    // violations raised by a procedure body from transport-level errors.
    private const string RaiseExceptionSqlState = "P0001";

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
                OperatorName = sm.Operator != null ? sm.Operator.Name : null,
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

    // ── Adjust batch (inline SQL, no SP) ─────────────────────────────────────

    public async Task<AssetBatchResponse> AdjustBatchAsync(
        Guid clubId, Guid operatorId, Guid batchId, AdjustBatchRequest req, CancellationToken ct = default)
    {
        if (req.QuantityDelta is null)
            throw new AppException("quantity_delta is required", 400);

        var batch = await LoadBatchInClubAsync(batchId, clubId, ct);
        var delta = req.QuantityDelta.Value;
        var newAvail = batch.AvailableQuantity + delta;

        if (newAvail < 0)
            throw new AppException("Adjustment would result in negative available quantity", 409);

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        var quantityBefore = batch.AvailableQuantity;
        batch.AvailableQuantity = newAvail;
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
            QuantityBefore = quantityBefore,
            QuantityAfter = newAvail,
            Notes = req.Notes ?? "Manual adjustment",
        });

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return MapBatch(batch);
    }

    // ── Retire batch (calls SP retire_batch) ─────────────────────────────────

    public async Task<AssetBatchResponse> RetireBatchAsync(
        Guid clubId, Guid operatorId, Guid batchId, RetireBatchRequest req, CancellationToken ct = default)
    {
        if (req.Quantity is null || req.Quantity < 1)
            throw new AppException("Positive quantity is required", 400);

        await AssertBatchInClubAsync(batchId, clubId, ct);

        try
        {
            await db.RetireBatchAsync(batchId, operatorId, req.Quantity.Value, req.Notes, ct);
        }
        catch (PostgresException ex) when (ex.SqlState == RaiseExceptionSqlState
            && ex.MessageText.Contains("Cannot retire", StringComparison.Ordinal))
        {
            throw new AppException(ex.MessageText, 409);
        }

        // Detach the cached entity (if any) so the post-call read returns the
        // SP-modified row from PG rather than EF Core's stale snapshot.
        return await ReloadBatchAsync(batchId, ct);
    }

    // ── Complete maintenance (calls SP complete_maintenance) ────────────────

    public async Task<AssetBatchResponse> CompleteMaintenanceAsync(
        Guid clubId, Guid operatorId, Guid batchId, MaintenanceBatchRequest req, CancellationToken ct = default)
    {
        if (req.QuantityRestored is null)
            throw new AppException("quantity_restored is required", 400);

        await AssertBatchInClubAsync(batchId, clubId, ct);

        try
        {
            await db.CompleteMaintenanceAsync(batchId, operatorId, req.QuantityRestored.Value, req.Notes, ct);
        }
        catch (PostgresException ex) when (ex.SqlState == RaiseExceptionSqlState
            && ex.MessageText.Contains("not in maintenance status", StringComparison.Ordinal))
        {
            throw new AppException(ex.MessageText, 409);
        }

        return await ReloadBatchAsync(batchId, ct);
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
                ConductedByName = s.ConductedByNavigation.Name,
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
            .Select(u => u.Name)
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

        // Live sum of available_quantity across batches per asset_type — used
        // for the items[].current_quantity column. We fetch all items for the
        // session and compute the sum per asset_type_id, then project.
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
                CurrentQuantity = db.AssetBatches
                    .Where(ab => ab.AssetTypeId == si.AssetTypeId)
                    .Sum(ab => (int?)ab.AvailableQuantity) ?? 0,
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

                // Verify the asset_type belongs to this club AND get live qty.
                var systemQty = await db.AssetTypes
                    .IgnoreQueryFilters()
                    .Where(at => at.Id == input.AssetTypeId.Value
                              && at.ClubId == clubId
                              && at.IsActive)
                    .Select(at => (int?)db.AssetBatches
                        .Where(ab => ab.AssetTypeId == at.Id)
                        .Sum(ab => (int?)ab.AvailableQuantity))
                    .FirstOrDefaultAsync(ct);

                if (systemQty is null) continue; // type not in this club / inactive

                // Upsert: query existing row first, then either update or insert.
                // EF Core 10 has no native ON CONFLICT DO UPDATE; this two-step
                // mirrors the Node UPSERT semantics including the special case
                // where the existing system_quantity is preserved on update
                // (the Node version overwrites it though — we follow Node).
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
                        SystemQuantity = systemQty.Value,
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
            .Select(u => u.Name)
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

    private async Task<AssetBatch> LoadBatchInClubAsync(Guid batchId, Guid clubId, CancellationToken ct)
    {
        var batch = await (
            from b in db.AssetBatches.IgnoreQueryFilters()
            join at in db.AssetTypes.IgnoreQueryFilters() on b.AssetTypeId equals at.Id
            where b.Id == batchId && at.ClubId == clubId
            select b
        ).FirstOrDefaultAsync(ct);
        return batch ?? throw new AppException("Batch not found", 404);
    }

    private async Task AssertBatchInClubAsync(Guid batchId, Guid clubId, CancellationToken ct)
    {
        var exists = await (
            from b in db.AssetBatches.IgnoreQueryFilters()
            join at in db.AssetTypes.IgnoreQueryFilters() on b.AssetTypeId equals at.Id
            where b.Id == batchId && at.ClubId == clubId
            select b.Id
        ).AnyAsync(ct);
        if (!exists) throw new AppException("Batch not found", 404);
    }

    // SP calls bypass the EF Core change tracker, so any cached AssetBatch
    // in the current scope is stale. Detach + reload to pick up the new row.
    private async Task<AssetBatchResponse> ReloadBatchAsync(Guid batchId, CancellationToken ct)
    {
        var tracked = db.ChangeTracker.Entries<AssetBatch>()
            .FirstOrDefault(e => e.Entity.Id == batchId);
        if (tracked is not null) tracked.State = EntityState.Detached;

        var batch = await db.AssetBatches
            .IgnoreQueryFilters()
            .AsNoTracking()
            .FirstAsync(b => b.Id == batchId, ct);
        return MapBatch(batch);
    }

    private static AssetBatchResponse MapBatch(AssetBatch b) => new()
    {
        Id = b.Id,
        AssetTypeId = b.AssetTypeId,
        PurchaseDate = b.PurchaseDate,
        PurchasePrice = b.PurchasePrice,
        UsefulLifeYears = b.UsefulLifeYears,
        TotalQuantity = b.TotalQuantity,
        AvailableQuantity = b.AvailableQuantity,
        Status = b.Status,
        Notes = b.Notes,
        CreatedAt = b.CreatedAt,
        UpdatedAt = b.UpdatedAt,
    };
}
