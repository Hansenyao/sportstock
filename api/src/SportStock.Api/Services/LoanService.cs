using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using SportStock.Api.Data;
using SportStock.Api.Data.Entities;
using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.Common;
using SportStock.Api.Dtos.Loans;
using SportStock.Api.Exceptions;

namespace SportStock.Api.Services;

// Ports backend/src/services/loan.service.ts. This is the most complex
// migrated service; the high-risk path is ConfirmReturnAsync which
// distributes returned/non-returned units back across the original checkout
// batches (FIFO across stock_movements) and emits both restoration
// stock_movements and write_off_orders.
internal sealed class LoanService(
    SportStockDbContext db,
    INotificationService notifications,
    IAuditLogService audit) : ILoanService
{
    private const string RaiseExceptionSqlState = "P0001";

    private static readonly HashSet<string> ValidStatusFilter = new(StringComparer.Ordinal)
    {
        "pending", "approved", "rejected", "checked_out", "returned",
    };

    // ── Projection ───────────────────────────────────────────────────────────

    // Same Expression-as-static-field trick used in AssetService — EF Core 10
    // cannot translate a helper-method invocation inside a Select, so the
    // projection lives in an Expression that the query compiler unwraps into
    // SQL with the proper LEFT JOIN tree. Note: Items is left empty here and
    // hydrated by a follow-up query in List/Get so the SELECT stays single-
    // row (no nested collection of nested collections).
    private static readonly Expression<Func<Loan, LoanResponse>> LoanProjection = l => new LoanResponse
    {
        Id = l.Id,
        ClubId = l.ClubId,
        CoachId = l.CoachId,
        TeamId = l.TeamId,
        CreatedBy = l.CreatedBy,
        ApprovedBy = l.ApprovedBy,
        CheckoutBy = l.CheckoutBy,
        ReturnConfirmedBy = l.ReturnConfirmedBy,
        Reason = l.Reason,
        Status = l.Status,
        DueDate = l.DueDate,
        RejectionReason = l.RejectionReason,
        CheckedOutAt = l.CheckedOutAt,
        ReturnedAt = l.ReturnedAt,
        ReturnNotes = l.ReturnNotes,
        DueReminderSentAt = l.DueReminderSentAt,
        OverdueNotifiedAt = l.OverdueNotifiedAt,
        CreatedAt = l.CreatedAt,
        UpdatedAt = l.UpdatedAt,
        WarehouseId   = l.WarehouseId,
        WarehouseName = l.Warehouse != null ? l.Warehouse.Name : null,
        CoachName = l.Coach.FirstName + " " + l.Coach.LastName,
        CoachEmail = l.Coach.Email,
        CoachAvatarUrl = l.Coach.AvatarUrl,
        CreatedByName = l.CreatedByNavigation != null
            ? l.CreatedByNavigation.FirstName + " " + l.CreatedByNavigation.LastName : null,
        ApprovedByName = l.ApprovedByNavigation != null
            ? l.ApprovedByNavigation.FirstName + " " + l.ApprovedByNavigation.LastName : null,
        CheckoutByName = l.CheckoutByNavigation != null
            ? l.CheckoutByNavigation.FirstName + " " + l.CheckoutByNavigation.LastName : null,
        ReturnConfirmedByName = l.ReturnConfirmedByNavigation != null
            ? l.ReturnConfirmedByNavigation.FirstName + " " + l.ReturnConfirmedByNavigation.LastName : null,
        TeamName = l.Team != null ? l.Team.Name : null,
    };

    // ── List ─────────────────────────────────────────────────────────────────

    public async Task<PaginatedResult<LoanResponse>> ListAsync(
        Guid clubId, Guid userId, ClubRole? role, ListLoansQuery query, CancellationToken ct = default)
    {
        if (query.Page < 1) query.Page = 1;
        if (query.Limit < 1) query.Limit = 20;

        IQueryable<Loan> source = db.Loans
            .IgnoreQueryFilters()
            .Where(l => l.ClubId == clubId);

        // Coaches only ever see their own loans; admin/manager filters honor
        // explicit coach_id + team_id query parameters.
        if (role == ClubRole.Coach)
        {
            source = source.Where(l => l.CoachId == userId);
        }
        else
        {
            if (query.CoachId is { } cid) source = source.Where(l => l.CoachId == cid);
            if (query.TeamId is { } tid) source = source.Where(l => l.TeamId == tid);
        }

        if (!string.IsNullOrEmpty(query.Overdue))
        {
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            source = source.Where(l => l.Status == LoanStatus.CheckedOut && l.DueDate < today);
        }
        else if (!string.IsNullOrWhiteSpace(query.Status))
        {
            if (!ValidStatusFilter.Contains(query.Status))
                throw new AppException(
                    "status must be one of: pending, approved, rejected, checked_out, returned", 400);
            var statusEnum = query.Status switch
            {
                "pending" => LoanStatus.Pending,
                "approved" => LoanStatus.Approved,
                "rejected" => LoanStatus.Rejected,
                "checked_out" => LoanStatus.CheckedOut,
                "returned" => LoanStatus.Returned,
                _ => LoanStatus.Pending,
            };
            source = source.Where(l => l.Status == statusEnum);
        }

        if (query.FromDate is { } from) source = source.Where(l => l.CreatedAt >= from);
        if (query.ToDate is { } to) source = source.Where(l => l.CreatedAt < to);

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var kw = $"%{query.Search}%";
            source = source.Where(l =>
                EF.Functions.ILike(l.Coach.FirstName + " " + l.Coach.LastName, kw)
                || EF.Functions.ILike(l.Coach.FirstName, kw)
                || db.LoanItems.Any(li =>
                    li.LoanId == l.Id
                    && EF.Functions.ILike(li.AssetType.AssetName.Name, kw)));
        }

        var total = await source.CountAsync(ct);

        var loans = await source
            .OrderByDescending(l => l.CreatedAt)
            .Skip((query.Page - 1) * query.Limit)
            .Take(query.Limit)
            .Select(LoanProjection)
            .ToListAsync(ct);

        if (loans.Count > 0)
        {
            var loanIds = loans.Select(l => l.Id).ToList();
            var items = await FetchItemsByLoanIdsAsync(loanIds, ct);
            var byLoan = items.GroupBy(i => i.LoanId)
                .ToDictionary(g => g.Key, g => (IReadOnlyList<LoanItemInfo>)g.ToList());
            foreach (var loan in loans)
            {
                loan.Items = byLoan.TryGetValue(loan.Id, out var its)
                    ? its : Array.Empty<LoanItemInfo>();
            }
        }

        return new PaginatedResult<LoanResponse>
        {
            Data = loans,
            Total = total,
            Page = query.Page,
            Limit = query.Limit,
        };
    }

    // ── Get single ───────────────────────────────────────────────────────────

    public async Task<LoanResponse> GetAsync(
        Guid loanId, Guid clubId, Guid userId, ClubRole? role, CancellationToken ct = default)
    {
        var loan = await db.Loans
            .IgnoreQueryFilters()
            .Where(l => l.Id == loanId && l.ClubId == clubId)
            .Select(LoanProjection)
            .FirstOrDefaultAsync(ct);
        if (loan is null) throw new AppException("Loan not found", 404);
        if (role == ClubRole.Coach && loan.CoachId != userId)
            throw new AppException("Access denied", 403);

        loan.Items = await FetchItemsByLoanIdsAsync(new[] { loanId }, ct);
        return loan;
    }

    // ── Create ───────────────────────────────────────────────────────────────

    public async Task<LoanResponse> CreateAsync(
        Guid clubId, Guid requesterId, ClubRole? requesterRole, CreateLoanRequest req, CancellationToken ct = default)
    {
        if (req.Items is null || req.Items.Count == 0)
            throw new AppException("At least one item is required", 400);
        if (req.DueDate is null)
            throw new AppException("due_date is required", 400);
        if (req.DueDate.Value <= DateOnly.FromDateTime(DateTime.UtcNow))
            throw new AppException("due_date must be a future date", 400);

        Guid coachId;
        if (requesterRole == ClubRole.Coach)
        {
            coachId = requesterId;
        }
        else
        {
            if (req.CoachId is null)
                throw new AppException("coach_id is required", 400);
            coachId = req.CoachId.Value;
        }

        var coach = await db.Users
            .IgnoreQueryFilters()
            .Where(u => u.Id == coachId && u.IsActive)
            .Select(u => new { Name = u.FirstName + " " + u.LastName })
            .FirstOrDefaultAsync(ct);
        if (coach is null) throw new AppException("Borrower not found in this club", 404);

        if (req.TeamId is { } teamId)
        {
            var ok = await (
                from t in db.Teams.IgnoreQueryFilters()
                join tm in db.TeamMembers.IgnoreQueryFilters() on t.Id equals tm.TeamId
                where t.Id == teamId && t.ClubId == clubId && tm.UserId == coachId
                select t.Id
            ).AnyAsync(ct);
            if (!ok) throw new AppException("Coach is not a member of this team", 400);
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        foreach (var item in req.Items)
        {
            if (item.AssetTypeId is null || item.Quantity is null || item.Quantity < 1)
                throw new AppException("Each item requires asset_type_id and positive quantity", 400);
            await AssertSufficientStockAsync(clubId, item.AssetTypeId.Value, item.Quantity.Value, ct);
        }

        var loan = new Loan
        {
            Id = Guid.NewGuid(),
            ClubId = clubId,
            CoachId = coachId,
            TeamId = req.TeamId,
            CreatedBy = requesterId,
            Reason = req.Reason,
            Status = LoanStatus.Pending,
            DueDate = req.DueDate.Value,
        };
        db.Loans.Add(loan);
        await db.SaveChangesAsync(ct);

        foreach (var item in req.Items)
        {
            db.LoanItems.Add(new LoanItem
            {
                Id          = Guid.NewGuid(),
                LoanId      = loan.Id,
                AssetTypeId = item.AssetTypeId!.Value,
                Quantity    = item.Quantity!.Value,
                KitId       = item.KitId,
                KitName     = item.KitName,
                KitQuantity = item.KitQuantity,
            });
        }
        await db.SaveChangesAsync(ct);

        await tx.CommitAsync(ct);

        await notifications.NotifyClubRolesAsync(
            clubId,
            new[] { ClubRole.AssetManager, ClubRole.ClubAdmin },
            NotificationType.LoanRequest,
            "New Loan Request",
            $"{coach.Name} is requesting {req.Items.Count} item(s)",
            new { loan_id = loan.Id, coach_id = coachId },
            ct);

        return await GetAsync(loan.Id, clubId, requesterId, requesterRole, ct);
    }

    // ── Update (pending only) ────────────────────────────────────────────────

    public async Task<LoanResponse> UpdateAsync(
        Guid loanId, Guid clubId, Guid userId, ClubRole? role, UpdateLoanRequest req, CancellationToken ct = default)
    {
        var loan = await db.Loans
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(l => l.Id == loanId && l.ClubId == clubId, ct);
        if (loan is null) throw new AppException("Loan not found", 404);
        if (loan.Status != LoanStatus.Pending)
            throw new AppException("Only pending loans can be edited", 409);
        if (role == ClubRole.Coach && loan.CoachId != userId)
            throw new AppException("Access denied", 403);
        if (role == ClubRole.Coach && req.CoachId is { } cid && cid != loan.CoachId)
            throw new AppException("Coaches cannot change the borrower", 403);

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        if (req.DueDate is { } due)
        {
            if (due <= DateOnly.FromDateTime(DateTime.UtcNow))
                throw new AppException("due_date must be a future date", 400);
            loan.DueDate = due;
        }
        if (req.Reason is not null) loan.Reason = req.Reason;
        if (req.CoachId is { } newCoach)
        {
            var ok = await db.ClubMemberships.IgnoreQueryFilters()
                .AnyAsync(m => m.UserId == newCoach && m.ClubId == clubId && m.IsActive, ct);
            if (!ok) throw new AppException("Borrower not found in this club", 404);
            loan.CoachId = newCoach;
        }

        if (req.TeamId is { } teamEl)
        {
            if (teamEl.ValueKind == System.Text.Json.JsonValueKind.Null)
            {
                loan.TeamId = null;
            }
            else
            {
                if (!teamEl.TryGetGuid(out var teamGuid))
                    throw new AppException("team_id must be a UUID or null", 400);
                var effCoach = req.CoachId ?? loan.CoachId;
                var ok = await (
                    from t in db.Teams.IgnoreQueryFilters()
                    join tm in db.TeamMembers.IgnoreQueryFilters() on t.Id equals tm.TeamId
                    where t.Id == teamGuid && t.ClubId == clubId && tm.UserId == effCoach
                    select t.Id
                ).AnyAsync(ct);
                if (!ok) throw new AppException("Coach is not a member of this team", 400);
                loan.TeamId = teamGuid;
            }
        }

        if (req.Items is not null)
        {
            if (req.Items.Count == 0)
                throw new AppException("At least one item is required", 400);

            foreach (var item in req.Items)
            {
                if (item.AssetTypeId is null || item.Quantity is null || item.Quantity < 1)
                    throw new AppException("Each item requires asset_type_id and positive quantity", 400);
                await AssertSufficientStockAsync(clubId, item.AssetTypeId.Value, item.Quantity.Value, ct);
            }

            await db.LoanItems.Where(li => li.LoanId == loanId).ExecuteDeleteAsync(ct);
            foreach (var item in req.Items)
            {
                db.LoanItems.Add(new LoanItem
                {
                    Id          = Guid.NewGuid(),
                    LoanId      = loanId,
                    AssetTypeId = item.AssetTypeId!.Value,
                    Quantity    = item.Quantity!.Value,
                    KitId       = item.KitId,
                    KitName     = item.KitName,
                    KitQuantity = item.KitQuantity,
                });
            }
        }

        loan.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return await GetAsync(loanId, clubId, userId, role, ct);
    }

    // ── Delete (pending only, creator only) ──────────────────────────────────

    public async Task DeleteAsync(
        Guid loanId, Guid clubId, Guid userId, ClubRole? role, CancellationToken ct = default)
    {
        var loan = await db.Loans
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(l => l.Id == loanId && l.ClubId == clubId, ct);
        if (loan is null) throw new AppException("Loan not found", 404);
        if (loan.Status != LoanStatus.Pending)
            throw new AppException("Only pending loans can be deleted", 409);
        if (loan.CreatedBy != userId
            && role != ClubRole.ClubAdmin && role != ClubRole.AssetManager)
            throw new AppException("Only the creator can delete this loan", 403);

        await db.Loans.Where(l => l.Id == loanId).ExecuteDeleteAsync(ct);
    }

    // ── Approve / Reject / Checkout (SPs) ────────────────────────────────────

    public async Task<LoanResponse> ApproveAsync(
        Guid loanId, Guid approverId, Guid clubId, Guid? warehouseId, CancellationToken ct = default)
    {
        try
        {
            await db.ApproveLoanAsync(loanId, approverId, warehouseId, ct);
        }
        catch (PostgresException ex) when (ex.SqlState == RaiseExceptionSqlState
            && ex.MessageText.Contains("not in pending status", StringComparison.Ordinal))
        {
            throw new AppException(ex.MessageText, 409);
        }

        DetachLoan(loanId);
        var loan = await GetAsync(loanId, clubId, approverId, ClubRole.ClubAdmin, ct);
        await notifications.NotifyUserAsync(
            clubId, loan.CoachId,
            NotificationType.LoanApproved,
            "Loan Request Approved",
            "Your loan request has been approved. Please confirm receipt when you pick up the items.",
            new { loan_id = loan.Id }, ct);
        await audit.LogAsync("loan.approve", loan.ClubId, approverId, "loan", loan.Id, new { loan_id = loan.Id });
        return loan;
    }

    public async Task<LoanResponse> RejectAsync(
        Guid loanId, Guid approverId, Guid clubId, string? reason, CancellationToken ct = default)
    {
        try
        {
            await db.RejectLoanAsync(loanId, approverId, reason, ct);
        }
        catch (PostgresException ex) when (ex.SqlState == RaiseExceptionSqlState
            && ex.MessageText.Contains("not in pending status", StringComparison.Ordinal))
        {
            throw new AppException(ex.MessageText, 409);
        }

        DetachLoan(loanId);
        var loan = await GetAsync(loanId, clubId, approverId, ClubRole.ClubAdmin, ct);
        var body = reason is not null
            ? $"Your loan request was rejected: {reason}"
            : "Your loan request was rejected.";
        await notifications.NotifyUserAsync(
            clubId, loan.CoachId, NotificationType.LoanRejected,
            "Loan Request Rejected", body, new { loan_id = loan.Id }, ct);
        return loan;
    }

    public async Task<LoanResponse> CheckoutAsync(
        Guid loanId, Guid operatorId, Guid clubId, CancellationToken ct = default)
    {
        var loan = await db.Loans
            .IgnoreQueryFilters()
            .Where(l => l.Id == loanId && l.ClubId == clubId)
            .Select(l => new { l.CoachId, l.Status })
            .FirstOrDefaultAsync(ct);
        if (loan is null) throw new AppException("Loan not found", 404);
        if (loan.CoachId != operatorId)
            throw new AppException("Only the borrower can confirm receipt", 403);
        if (loan.Status != LoanStatus.Approved)
            throw new AppException("Loan is not in approved status", 409);

        // Validate sufficient available asset_items exist for each line before
        // calling the stored procedure (SP will still double-check, but this
        // gives a friendlier error message with the asset type ID).
        var loanItems = await db.LoanItems
            .Where(li => li.LoanId == loanId)
            .Select(li => new { li.AssetTypeId, li.Quantity })
            .ToListAsync(ct);

        foreach (var li in loanItems)
        {
            var available = await db.AssetItems
                .CountAsync(i => i.AssetTypeId == li.AssetTypeId
                              && i.ClubId == clubId
                              && i.Status == AssetItemStatus.Available, ct);
            if (available < li.Quantity)
                throw new AppException(
                    $"Insufficient stock for asset type {li.AssetTypeId}: need {li.Quantity}, have {available}", 409);
        }

        try
        {
            await db.CheckoutLoanAsync(loanId, ct);
        }
        catch (PostgresException ex) when (ex.SqlState == RaiseExceptionSqlState
            && (ex.MessageText.Contains("not in approved status", StringComparison.Ordinal)
             || ex.MessageText.Contains("Insufficient stock", StringComparison.Ordinal)))
        {
            throw new AppException(ex.MessageText, 409);
        }

        DetachLoan(loanId);
        await audit.LogAsync("loan.checkout", clubId, operatorId, "loan", loanId, new { loan_id = loanId });
        return await GetAsync(loanId, clubId, operatorId, ClubRole.ClubAdmin, ct);
    }

    // ── Confirm Return (the hairy one) ───────────────────────────────────────

    public async Task<LoanResponse> ConfirmReturnAsync(
        Guid loanId, Guid operatorId, Guid clubId, ReturnLoanRequest req, CancellationToken ct = default)
    {
        if (req.Items is null || req.Items.Count == 0)
            throw new AppException("items array is required", 400);

        var loan = await db.Loans
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(l => l.Id == loanId && l.ClubId == clubId
                && l.Status == LoanStatus.CheckedOut, ct);
        if (loan is null) throw new AppException("Loan is not in checked_out status", 409);

        var existingItems = await db.LoanItems
            .Where(li => li.LoanId == loanId)
            .Select(li => new
            {
                li.Id,
                li.Quantity,
                li.AssetTypeId,
                AssetName = li.AssetType.AssetName.Name,
            })
            .ToListAsync(ct);
        var byId = existingItems.ToDictionary(i => i.Id);

        foreach (var ri in req.Items)
        {
            if (!byId.TryGetValue(ri.LoanItemId, out var item))
                throw new AppException($"loan_item_id {ri.LoanItemId} not found in this loan", 404);
            var total = ri.GoodQuantity + ri.MinorDamageQuantity + ri.WriteOffQuantity + ri.LostQuantity;
            if (total != item.Quantity)
                throw new AppException(
                    $"Quantities for \"{item.AssetName}\" must sum to {item.Quantity} (got {total})", 400);
            if (ri.GoodQuantity < 0 || ri.MinorDamageQuantity < 0
                || ri.WriteOffQuantity < 0 || ri.LostQuantity < 0)
                throw new AppException(
                    $"All return quantities must be non-negative for \"{item.AssetName}\"", 400);
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        foreach (var ri in req.Items)
        {
            var item = byId[ri.LoanItemId];
            var autoNote = BuildReturnNote(ri.GoodQuantity, ri.MinorDamageQuantity, ri.WriteOffQuantity, ri.LostQuantity);
            var itemNote = ri.Notes is not null ? $"{autoNote}; {ri.Notes}" : autoNote;

            // Persist the four-bucket breakdown on the loan_item record.
            await db.LoanItems
                .Where(li => li.Id == ri.LoanItemId)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(li => li.GoodQuantity, ri.GoodQuantity)
                    .SetProperty(li => li.MinorDamageQuantity, ri.MinorDamageQuantity)
                    .SetProperty(li => li.WriteOffQuantity, ri.WriteOffQuantity)
                    .SetProperty(li => li.LostQuantity, ri.LostQuantity)
                    .SetProperty(li => li.ReturnNotes, itemNote)
                    .SetProperty(li => li.UpdatedAt, DateTime.UtcNow), ct);

            // Derive a single condition for the SP based on the worst outcome
            // of the physically returned items:
            //   good -> items come back available
            //   damaged -> items go to maintenance
            //   (else) -> items are written_off / lost
            var condition = ri.GoodQuantity > 0 ? "good"
                : ri.MinorDamageQuantity > 0 ? "damaged"
                : "written_off";

            // The SP updates asset_item.status for all assignments and removes
            // the loan_item_assignments rows for this loan_item.
            await db.ReturnLoanItemAsync(ri.LoanItemId, condition, ct);

            // Write-off / lost orders are still tracked at the application
            // layer so the inventory audit trail remains complete.
            if (ri.WriteOffQuantity > 0)
            {
                db.WriteOffOrders.Add(new WriteOffOrder
                {
                    Id = Guid.NewGuid(),
                    ClubId = clubId,
                    AssetTypeId = item.AssetTypeId,
                    Quantity = ri.WriteOffQuantity,
                    Reason = "Write-off from loan return",
                    Source = WriteOffSource.LoanReturn,
                    LoanItemId = ri.LoanItemId,
                    CreatedBy = operatorId,
                    Notes = itemNote,
                });
            }
            if (ri.LostQuantity > 0)
            {
                db.WriteOffOrders.Add(new WriteOffOrder
                {
                    Id = Guid.NewGuid(),
                    ClubId = clubId,
                    AssetTypeId = item.AssetTypeId,
                    Quantity = ri.LostQuantity,
                    Reason = "Lost item from loan return",
                    Source = WriteOffSource.LoanLost,
                    LoanItemId = ri.LoanItemId,
                    CreatedBy = operatorId,
                    Notes = itemNote,
                });
            }
            await db.SaveChangesAsync(ct);
        }

        await db.Loans
            .IgnoreQueryFilters()
            .Where(l => l.Id == loanId)
            .ExecuteUpdateAsync(s => s
                .SetProperty(l => l.Status, LoanStatus.Returned)
                .SetProperty(l => l.ReturnConfirmedBy, (Guid?)operatorId)
                .SetProperty(l => l.ReturnedAt, (DateTime?)DateTime.UtcNow)
                .SetProperty(l => l.ReturnNotes, req.Notes)
                .SetProperty(l => l.UpdatedAt, DateTime.UtcNow), ct);

        await tx.CommitAsync(ct);

        await notifications.NotifyUserAsync(
            clubId, loan.CoachId, NotificationType.ReturnInitiated,
            "Return Confirmed", "Your loan return has been confirmed.",
            new { loan_id = loanId }, ct);
        await audit.LogAsync("loan.return", clubId, operatorId, "loan", loanId, new { loan_id = loanId });

        DetachLoan(loanId);
        return await GetAsync(loanId, clubId, operatorId, ClubRole.ClubAdmin, ct);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private async Task AssertSufficientStockAsync(
        Guid clubId, Guid assetTypeId, int requested, CancellationToken ct)
    {
        var info = await db.AssetTypes
            .IgnoreQueryFilters()
            .Where(at => at.Id == assetTypeId && at.ClubId == clubId && at.IsActive)
            .Select(at => new
            {
                AssetName = at.AssetName.Name,
                Available = db.AssetItems
                    .Count(ai => ai.AssetTypeId == at.Id
                              && ai.ClubId == clubId
                              && ai.Status == AssetItemStatus.Available),
            })
            .FirstOrDefaultAsync(ct);
        if (info is null)
            throw new AppException($"Asset type {assetTypeId} not found", 404);
        if (info.Available < requested)
            throw new AppException(
                $"Insufficient quantity for \"{info.AssetName}\": requested {requested}, available {info.Available}", 409);
    }

    private async Task<List<LoanItemInfo>> FetchItemsByLoanIdsAsync(
        IReadOnlyCollection<Guid> loanIds, CancellationToken ct)
    {
        return await db.LoanItems
            .Where(li => loanIds.Contains(li.LoanId))
            .OrderBy(li => li.CreatedAt)
            .Select(li => new LoanItemInfo
            {
                Id = li.Id,
                LoanId = li.LoanId,
                AssetTypeId = li.AssetTypeId,
                Quantity = li.Quantity,
                GoodQuantity = li.GoodQuantity,
                MinorDamageQuantity = li.MinorDamageQuantity,
                WriteOffQuantity = li.WriteOffQuantity,
                LostQuantity = li.LostQuantity,
                ReturnNotes = li.ReturnNotes,
                KitId       = li.KitId,
                KitName     = li.KitName,
                KitQuantity = li.KitQuantity,
                CreatedAt = li.CreatedAt,
                UpdatedAt = li.UpdatedAt,
                ReturnedQuantity = (li.GoodQuantity ?? 0) + (li.MinorDamageQuantity ?? 0),
                AssetName = li.AssetType.AssetName.Name,
                AssetImage = li.AssetType.ImageUrl,
                Brand = li.AssetType.Brand,
                Model = li.AssetType.Model,
                Size = li.AssetType.Size,
            })
            .ToListAsync(ct);
    }

    // SPs run outside the change tracker; any tracked Loan / AssetBatch is
    // stale after the procedure body mutates rows. Detach so subsequent
    // GetAsync reads the post-SP snapshot.
    private void DetachLoan(Guid loanId)
    {
        var entry = db.ChangeTracker.Entries<Loan>()
            .FirstOrDefault(e => e.Entity.Id == loanId);
        if (entry is not null) entry.State = EntityState.Detached;
    }

    private static string BuildReturnNote(int good, int minor, int writeOff, int lost)
    {
        var parts = new List<string>(4);
        if (good > 0) parts.Add($"{good} good");
        if (minor > 0) parts.Add($"{minor} minor damage");
        if (writeOff > 0) parts.Add($"{writeOff} written off");
        if (lost > 0) parts.Add($"{lost} lost");
        return string.Join(", ", parts);
    }
}
