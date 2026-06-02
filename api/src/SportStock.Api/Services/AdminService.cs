using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using SportStock.Api.Data;
using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.Admin;
using SportStock.Api.Dtos.Common;
using SportStock.Api.Exceptions;

namespace SportStock.Api.Services;

// Ports backend/src/services/admin.service.ts. Super-admin cross-tenant
// surface — the auth-side global club_id filter is bypassed everywhere via
// IgnoreQueryFilters() since this service IS the cross-tenant explorer.
internal sealed class AdminService(SportStockDbContext db) : IAdminService
{
    private const string TempPasswordChars =
        "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

    private static readonly HashSet<string> ValidLoanStatusFilter = new(StringComparer.Ordinal)
    {
        "pending", "approved", "rejected", "checked_out", "returned",
    };

    private static readonly HashSet<string> ValidAssetStatusFilter = new(StringComparer.Ordinal)
    {
        "available", "on_loan", "retired",
    };

    public async Task<PlatformStatsResponse> GetPlatformStatsAsync(CancellationToken ct = default)
    {
        return await db.Database.SqlQuery<PlatformStatsResponse>($@"
            SELECT
                (SELECT COUNT(*) FROM clubs)                                                                AS ""TotalClubs"",
                (SELECT COUNT(*) FROM clubs WHERE is_active = true)                                         AS ""ActiveClubs"",
                (SELECT COUNT(*) FROM users WHERE role != 'super_admin')                                    AS ""TotalUsers"",
                (SELECT COALESCE(SUM(total_quantity), 0) FROM asset_batches)                                AS ""TotalAssets"",
                (SELECT COUNT(*) FROM loans WHERE status = 'checked_out')                                   AS ""ActiveLoans"",
                (SELECT COUNT(*) FROM loans WHERE status = 'checked_out' AND due_date < CURRENT_DATE)       AS ""OverdueLoans""
        ").FirstAsync(ct);
    }

    public async Task<object> GetAnalyticsOverviewAsync(Guid? clubId, CancellationToken ct = default)
    {
        if (clubId is { } cid)
        {
            var stats = await db.Database.SqlQuery<AnalyticsOverviewClubStatsRow>($@"
                SELECT
                    (SELECT COUNT(*) FROM users WHERE club_id = {cid} AND role != 'super_admin')       AS ""UserCount"",
                    (SELECT COALESCE(SUM(ab.total_quantity), 0)
                     FROM asset_batches ab
                     JOIN asset_types at2 ON at2.id = ab.asset_type_id
                     WHERE at2.club_id = {cid})                                                          AS ""AssetCount"",
                    (SELECT COUNT(*) FROM loans WHERE club_id = {cid} AND status = 'checked_out')        AS ""ActiveLoans"",
                    (SELECT COUNT(*) FROM loans
                     WHERE club_id = {cid} AND status = 'checked_out' AND due_date < CURRENT_DATE)       AS ""OverdueLoans""
            ").FirstAsync(ct);

            var statusRows = await db.Database.SqlQuery<AssetByStatusRow>($@"
                SELECT ab.status::text AS ""Status"",
                       COALESCE(SUM(ab.total_quantity), 0) AS ""Total""
                FROM asset_batches ab
                JOIN asset_types at2 ON at2.id = ab.asset_type_id
                WHERE at2.club_id = {cid}
                GROUP BY ab.status").ToListAsync(ct);

            var valueRow = await db.Database.SqlQuery<TotalAssetValueRow>($@"
                SELECT COALESCE(SUM(ab.purchase_price * ab.total_quantity), 0) AS ""TotalValue""
                FROM asset_batches ab
                JOIN asset_types at2 ON at2.id = ab.asset_type_id
                WHERE at2.club_id = {cid}").FirstAsync(ct);

            return new AnalyticsOverviewClub
            {
                UserCount = stats.UserCount,
                AssetCount = stats.AssetCount,
                ActiveLoans = stats.ActiveLoans,
                OverdueLoans = stats.OverdueLoans,
                AssetByStatus = statusRows.Select(r => new AssetByStatusItem
                {
                    Status = r.Status,
                    Total = r.Total,
                }).ToList(),
                TotalAssetValue = valueRow.TotalValue,
            };
        }

        var platform = await GetPlatformStatsAsync(ct);
        var allStatus = await db.Database.SqlQuery<AssetByStatusRow>($@"
            SELECT status::text AS ""Status"",
                   COALESCE(SUM(total_quantity), 0) AS ""Total""
            FROM asset_batches
            GROUP BY status").ToListAsync(ct);
        var allValue = await db.Database.SqlQuery<TotalAssetValueRow>($@"
            SELECT COALESCE(SUM(purchase_price * total_quantity), 0) AS ""TotalValue""
            FROM asset_batches").FirstAsync(ct);

        return new AnalyticsOverviewPlatform
        {
            TotalClubs = platform.TotalClubs,
            ActiveClubs = platform.ActiveClubs,
            TotalUsers = platform.TotalUsers,
            TotalAssets = platform.TotalAssets,
            ActiveLoans = platform.ActiveLoans,
            OverdueLoans = platform.OverdueLoans,
            AssetByStatus = allStatus.Select(r => new AssetByStatusItem
            {
                Status = r.Status,
                Total = r.Total,
            }).ToList(),
            TotalAssetValue = allValue.TotalValue,
        };
    }

    public async Task<AnalyticsLoansResponse> GetAnalyticsLoansAsync(
        Guid? clubId, CancellationToken ct = default)
    {
        var trend = await db.Database.SqlQuery<AnalyticsLoanTrendRow>($@"
            SELECT TO_CHAR(DATE_TRUNC('month', l.created_at), 'YYYY-MM') AS ""Month"",
                   COUNT(DISTINCT l.id) AS ""LoanCount""
            FROM loans l
            WHERE l.created_at >= NOW() - INTERVAL '12 months'
              AND ({clubId}::uuid IS NULL OR l.club_id = {clubId})
            GROUP BY 1 ORDER BY 1").ToListAsync(ct);

        var top = await db.Database.SqlQuery<AnalyticsTopAssetRow>($@"
            SELECT an.name AS ""AssetName"",
                   COUNT(li.id) AS ""LoanCount""
            FROM loan_items li
            JOIN asset_types at2 ON at2.id = li.asset_type_id
            JOIN asset_names an  ON an.id  = at2.asset_name_id
            WHERE ({clubId}::uuid IS NULL OR at2.club_id = {clubId})
            GROUP BY an.name
            ORDER BY ""LoanCount"" DESC
            LIMIT 10").ToListAsync(ct);

        return new AnalyticsLoansResponse
        {
            MonthlyTrend = trend.Select(r => new AnalyticsLoanTrend
            {
                Month = r.Month, LoanCount = r.LoanCount,
            }).ToList(),
            TopAssets = top.Select(r => new AnalyticsTopAssetItem
            {
                AssetName = r.AssetName, LoanCount = r.LoanCount,
            }).ToList(),
        };
    }

    public async Task<AnalyticsAssetsResponse> GetAnalyticsAssetsAsync(
        Guid? clubId, CancellationToken ct = default)
    {
        var status = await db.Database.SqlQuery<AnalyticsAssetsStatusRow>($@"
            SELECT ab.status::text AS ""Status"",
                   COUNT(*)::bigint AS ""BatchCount"",
                   COALESCE(SUM(ab.total_quantity), 0)::bigint AS ""TotalQty"",
                   COALESCE(SUM(ab.purchase_price * ab.total_quantity), 0) AS ""TotalValue""
            FROM asset_batches ab
            LEFT JOIN asset_types at2 ON at2.id = ab.asset_type_id
            WHERE ({clubId}::uuid IS NULL OR at2.club_id = {clubId})
            GROUP BY ab.status").ToListAsync(ct);

        var category = await db.Database.SqlQuery<AnalyticsAssetsCategoryRow>($@"
            SELECT COALESCE(ac.name, 'Uncategorized') AS ""Category"",
                   COUNT(DISTINCT at2.id)::bigint AS ""TypeCount"",
                   COALESCE(SUM(ab.total_quantity), 0)::bigint AS ""TotalQty"",
                   COALESCE(SUM(ab.purchase_price * ab.total_quantity), 0) AS ""TotalValue""
            FROM asset_batches ab
            JOIN asset_types at2 ON at2.id = ab.asset_type_id
            JOIN asset_names an  ON an.id  = at2.asset_name_id
            LEFT JOIN asset_categories ac ON ac.id = an.category_id
            WHERE ({clubId}::uuid IS NULL OR at2.club_id = {clubId})
            GROUP BY ac.name
            ORDER BY ""TotalQty"" DESC").ToListAsync(ct);

        return new AnalyticsAssetsResponse
        {
            ByStatus = status.Select(r => new AnalyticsAssetsStatusItem
            {
                Status = r.Status,
                BatchCount = r.BatchCount,
                TotalQty = r.TotalQty,
                TotalValue = r.TotalValue,
            }).ToList(),
            ByCategory = category.Select(r => new AnalyticsAssetsCategoryItem
            {
                Category = r.Category,
                TypeCount = r.TypeCount,
                TotalQty = r.TotalQty,
                TotalValue = r.TotalValue,
            }).ToList(),
        };
    }

    public async Task<AnalyticsGrowthResponse> GetAnalyticsGrowthAsync(CancellationToken ct = default)
    {
        var clubs = await db.Database.SqlQuery<AnalyticsGrowthClubRow>($@"
            SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS ""Month"",
                   COUNT(*) AS ""NewClubs""
            FROM clubs WHERE created_at >= NOW() - INTERVAL '12 months'
            GROUP BY 1 ORDER BY 1").ToListAsync(ct);

        var users = await db.Database.SqlQuery<AnalyticsGrowthUserRow>($@"
            SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS ""Month"",
                   COUNT(*) AS ""NewUsers""
            FROM users
            WHERE created_at >= NOW() - INTERVAL '12 months' AND role != 'super_admin'
            GROUP BY 1 ORDER BY 1").ToListAsync(ct);

        return new AnalyticsGrowthResponse
        {
            Clubs = clubs.Select(r => new AnalyticsGrowthClubItem
            {
                Month = r.Month, NewClubs = r.NewClubs,
            }).ToList(),
            Users = users.Select(r => new AnalyticsGrowthUserItem
            {
                Month = r.Month, NewUsers = r.NewUsers,
            }).ToList(),
        };
    }

    public async Task<PaginatedResult<ClubListItemResponse>> ListClubsAsync(
        ListClubsQuery query, CancellationToken ct = default)
    {
        if (query.Page < 1) query.Page = 1;
        if (query.Limit < 1) query.Limit = 20;

        var search = string.IsNullOrWhiteSpace(query.Search) ? null : $"%{query.Search}%";

        var total = await db.Database.SqlQuery<CountRow>($@"
            SELECT COUNT(*) AS ""Count""
            FROM clubs
            WHERE ({search}::text IS NULL OR name ILIKE {search})").FirstAsync(ct);

        var rows = await db.Database.SqlQuery<ClubListItemResponse>($@"
            SELECT c.id                                                                          AS ""Id"",
                   c.name                                                                        AS ""Name"",
                   c.sport_type                                                                  AS ""SportType"",
                   c.contact_email                                                               AS ""ContactEmail"",
                   c.is_active                                                                   AS ""IsActive"",
                   c.created_at                                                                  AS ""CreatedAt"",
                   COUNT(DISTINCT u.id) FILTER (WHERE u.role != 'super_admin')                   AS ""UserCount"",
                   COALESCE(SUM(ab.total_quantity), 0)                                           AS ""AssetCount"",
                   COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'checked_out')                  AS ""ActiveLoanCount""
            FROM clubs c
            LEFT JOIN users u           ON u.club_id           = c.id
            LEFT JOIN asset_types at2   ON at2.club_id         = c.id
            LEFT JOIN asset_batches ab  ON ab.asset_type_id    = at2.id
            LEFT JOIN loans l           ON l.club_id            = c.id
            WHERE ({search}::text IS NULL OR c.name ILIKE {search})
            GROUP BY c.id
            ORDER BY c.created_at DESC
            LIMIT {query.Limit} OFFSET {(query.Page - 1) * query.Limit}").ToListAsync(ct);

        return new PaginatedResult<ClubListItemResponse>
        {
            Data = rows, Total = (int)total.Count, Page = query.Page, Limit = query.Limit,
        };
    }

    public async Task<ClubDetailResponse> GetClubAsync(Guid clubId, CancellationToken ct = default)
    {
        var row = await db.Database.SqlQuery<ClubDetailRow>($@"
            SELECT c.id                  AS ""Id"",
                   c.name                AS ""Name"",
                   c.sport_type          AS ""SportType"",
                   c.contact_email       AS ""ContactEmail"",
                   c.address             AS ""Address"",
                   c.is_active           AS ""IsActive"",
                   c.created_at          AS ""CreatedAt"",
                   u.id                  AS ""AdminId"",
                   u.name                AS ""AdminName"",
                   u.email               AS ""AdminEmail"",
                   u.is_active           AS ""AdminIsActive"",
                   u.email_verified      AS ""AdminEmailVerified"",
                   (SELECT COUNT(*) FROM users u2 WHERE u2.club_id = c.id AND u2.role != 'super_admin') AS ""UserCount"",
                   (SELECT COALESCE(SUM(ab.total_quantity), 0)
                    FROM asset_batches ab
                    JOIN asset_types at2 ON at2.id = ab.asset_type_id
                    WHERE at2.club_id = c.id)                                                                AS ""AssetCount"",
                   (SELECT COUNT(*) FROM loans l WHERE l.club_id = c.id AND l.status = 'checked_out')        AS ""ActiveLoanCount"",
                   (SELECT COUNT(*) FROM loans l
                    WHERE l.club_id = c.id AND l.status = 'checked_out' AND l.due_date < CURRENT_DATE)       AS ""OverdueLoanCount""
            FROM clubs c
            LEFT JOIN LATERAL (
                SELECT id, name, email, is_active, email_verified
                FROM users
                WHERE club_id = c.id AND role = 'club_admin'
                ORDER BY created_at ASC
                LIMIT 1
            ) u ON true
            WHERE c.id = {clubId}").FirstOrDefaultAsync(ct);

        if (row is null) throw new AppException("Club not found", 404);

        return new ClubDetailResponse
        {
            Id = row.Id,
            Name = row.Name,
            SportType = row.SportType,
            ContactEmail = row.ContactEmail,
            Address = row.Address,
            IsActive = row.IsActive,
            CreatedAt = row.CreatedAt,
            AdminAccount = row.AdminId is { } adminId
                ? new ClubAdminAccount
                {
                    Id = adminId,
                    Name = row.AdminName ?? string.Empty,
                    Email = row.AdminEmail ?? string.Empty,
                    IsActive = row.AdminIsActive ?? false,
                    EmailVerified = row.AdminEmailVerified ?? false,
                }
                : null,
            Stats = new ClubStats
            {
                UserCount = row.UserCount,
                AssetCount = row.AssetCount,
                ActiveLoanCount = row.ActiveLoanCount,
                OverdueLoanCount = row.OverdueLoanCount,
            },
        };
    }

    public async Task UpdateClubStatusAsync(Guid clubId, bool isActive, CancellationToken ct = default)
    {
        var rows = await db.Clubs
            .IgnoreQueryFilters()
            .Where(c => c.Id == clubId)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.IsActive, isActive), ct);
        if (rows == 0) throw new AppException("Club not found", 404);
    }

    public async Task<string> ResetClubAdminPasswordAsync(Guid clubId, CancellationToken ct = default)
    {
        var temp = GenerateTempPassword();
        var hash = BCrypt.Net.BCrypt.HashPassword(temp, 10);
        // Find club admin users via membership table
        var adminUserIds = await db.ClubMemberships
            .IgnoreQueryFilters()
            .Where(m => m.ClubId == clubId && m.Role == ClubRole.ClubAdmin && m.IsActive)
            .Select(m => m.UserId)
            .ToListAsync(ct);
        if (adminUserIds.Count == 0) throw new AppException("No club admin found for this club", 404);

        var rows = await db.Users
            .IgnoreQueryFilters()
            .Where(u => adminUserIds.Contains(u.Id))
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.PasswordHash, hash), ct);
        if (rows == 0) throw new AppException("No club admin found for this club", 404);
        return temp;
    }

    public async Task<PaginatedResult<AdminUserItem>> ListClubUsersAsync(
        Guid clubId, int page, int limit, CancellationToken ct = default)
    {
        if (page < 1) page = 1;
        if (limit < 1) limit = 20;

        var source = db.ClubMemberships
            .IgnoreQueryFilters()
            .Where(m => m.ClubId == clubId);

        var total = await source.CountAsync(ct);
        var data = await source
            .OrderByDescending(m => m.User.CreatedAt)
            .Skip((page - 1) * limit)
            .Take(limit)
            .Select(m => new AdminUserItem
            {
                Id = m.UserId,
                Name = m.User.FirstName + " " + m.User.LastName,
                Email = m.User.Email,
                Role = m.Role,
                IsActive = m.IsActive,
                EmailVerified = m.User.EmailVerified,
                CreatedAt = m.User.CreatedAt,
            })
            .ToListAsync(ct);

        return new PaginatedResult<AdminUserItem>
        {
            Data = data, Total = total, Page = page, Limit = limit,
        };
    }

    public async Task UpdateUserStatusAsync(Guid clubId, Guid userId, bool isActive, CancellationToken ct = default)
    {
        // In v2, IsActive is on ClubMembership, not User
        var rows = await db.ClubMemberships
            .IgnoreQueryFilters()
            .Where(m => m.UserId == userId && m.ClubId == clubId)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.IsActive, isActive), ct);
        if (rows == 0) throw new AppException("User not found in this club", 404);
    }

    public async Task<string> ResetUserPasswordAsync(Guid clubId, Guid userId, CancellationToken ct = default)
    {
        var temp = GenerateTempPassword();
        var hash = BCrypt.Net.BCrypt.HashPassword(temp, 10);

        // Verify user belongs to this club
        var isMember = await db.ClubMemberships
            .IgnoreQueryFilters()
            .AnyAsync(m => m.UserId == userId && m.ClubId == clubId, ct);
        if (!isMember) throw new AppException("User not found in this club", 404);

        var rows = await db.Users
            .IgnoreQueryFilters()
            .Where(u => u.Id == userId)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.PasswordHash, hash), ct);
        if (rows == 0) throw new AppException("User not found in this club", 404);
        return temp;
    }

    public async Task<PaginatedResult<AdminAssetItem>> ListClubAssetsAsync(
        Guid clubId, ListClubResourcesQuery query, CancellationToken ct = default)
    {
        if (query.Page < 1) query.Page = 1;
        if (query.Limit < 1) query.Limit = 20;

        if (query.Status is not null && !ValidAssetStatusFilter.Contains(query.Status))
            throw new AppException(
                "status must be one of: available, on_loan, retired", 400);

        IQueryable<Data.Entities.AssetType> source = db.AssetTypes
            .IgnoreQueryFilters()
            .Where(at => at.ClubId == clubId);

        if (!string.IsNullOrWhiteSpace(query.Search))
            source = source.Where(at => EF.Functions.ILike(at.AssetName.Name, $"%{query.Search}%"));

        IQueryable<AdminAssetItem> projected = source
            .OrderBy(at => at.AssetName.Name)
            .ThenBy(at => at.Brand)
            .Select(at => new AdminAssetItem
            {
                Id = at.Id,
                Name = at.AssetName.Name,
                CategoryId = at.AssetName.CategoryId,
                CategoryName = at.AssetName.Category != null ? at.AssetName.Category.Name : null,
                Brand = at.Brand,
                Model = at.Model,
                Size = at.Size,
                ImageUrl = at.ImageUrl,
                IsActive = at.IsActive,
                CreatedAt = at.CreatedAt,
                TotalQuantity = at.AssetBatches.Sum(b => (long?)b.TotalQuantity) ?? 0,
                AvailableQuantity = db.AssetItems.Count(ai => ai.AssetTypeId == at.Id && ai.Status == AssetItemStatus.Available),
                BatchCount = at.AssetBatches.Count(),
                Status = at.AssetBatches.Count() == 0
                         || at.AssetBatches.Sum(b => (long?)b.TotalQuantity) == 0
                            ? "retired"
                            : db.AssetItems.Count(ai => ai.AssetTypeId == at.Id && ai.Status == AssetItemStatus.Available) == 0
                                ? "on_loan"
                                : "available",
            });

        if (query.Status is not null)
            projected = projected.Where(p => p.Status == query.Status);

        var total = await projected.CountAsync(ct);
        var data = await projected
            .Skip((query.Page - 1) * query.Limit)
            .Take(query.Limit)
            .ToListAsync(ct);

        return new PaginatedResult<AdminAssetItem>
        {
            Data = data, Total = total, Page = query.Page, Limit = query.Limit,
        };
    }

    public async Task UpdateAssetStatusAsync(Guid clubId, Guid assetTypeId, bool isActive, CancellationToken ct = default)
    {
        var rows = await db.AssetTypes
            .IgnoreQueryFilters()
            .Where(at => at.Id == assetTypeId && at.ClubId == clubId)
            .ExecuteUpdateAsync(s => s
                .SetProperty(at => at.IsActive, isActive)
                .SetProperty(at => at.UpdatedAt, DateTime.UtcNow), ct);
        if (rows == 0) throw new AppException("Asset not found in this club", 404);
    }

    public async Task DeleteAssetAsync(Guid clubId, Guid assetTypeId, CancellationToken ct = default)
    {
        var hasActiveLoan = await (
            from li in db.LoanItems
            join l in db.Loans.IgnoreQueryFilters() on li.LoanId equals l.Id
            where li.AssetTypeId == assetTypeId
                  && l.Status != LoanStatus.Returned
                  && l.Status != LoanStatus.Rejected
            select li.Id
        ).AnyAsync(ct);
        if (hasActiveLoan)
            throw new AppException("Cannot delete: asset has active or pending loans", 409);

        var rows = await db.AssetTypes
            .IgnoreQueryFilters()
            .Where(at => at.Id == assetTypeId && at.ClubId == clubId)
            .ExecuteDeleteAsync(ct);
        if (rows == 0) throw new AppException("Asset not found in this club", 404);
    }

    public async Task<PaginatedResult<AdminLoanItem>> ListClubLoansAsync(
        Guid clubId, int page, int limit, string? status, CancellationToken ct = default)
    {
        if (page < 1) page = 1;
        if (limit < 1) limit = 20;

        LoanStatus? statusFilter = null;
        if (!string.IsNullOrWhiteSpace(status))
        {
            if (!ValidLoanStatusFilter.Contains(status))
                throw new AppException(
                    "status must be one of: pending, approved, rejected, checked_out, returned", 400);
            statusFilter = status switch
            {
                "pending" => LoanStatus.Pending,
                "approved" => LoanStatus.Approved,
                "rejected" => LoanStatus.Rejected,
                "checked_out" => LoanStatus.CheckedOut,
                "returned" => LoanStatus.Returned,
                _ => null,
            };
        }

        IQueryable<Data.Entities.Loan> source = db.Loans
            .IgnoreQueryFilters()
            .Where(l => l.ClubId == clubId);
        if (statusFilter is { } sf)
            source = source.Where(l => l.Status == sf);

        var total = await source.CountAsync(ct);
        var data = await source
            .OrderByDescending(l => l.CreatedAt)
            .Skip((page - 1) * limit)
            .Take(limit)
            .Select(l => new AdminLoanItem
            {
                Id = l.Id,
                Status = l.Status,
                DueDate = l.DueDate,
                CreatedAt = l.CreatedAt,
                CoachName = l.Coach.FirstName + " " + l.Coach.LastName,
                ItemCount = db.LoanItems.Count(li => li.LoanId == l.Id),
            })
            .ToListAsync(ct);

        return new PaginatedResult<AdminLoanItem>
        {
            Data = data, Total = total, Page = page, Limit = limit,
        };
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static string GenerateTempPassword()
    {
        Span<byte> buf = stackalloc byte[12];
        RandomNumberGenerator.Fill(buf);
        var chars = new char[12];
        for (var i = 0; i < buf.Length; i++)
            chars[i] = TempPasswordChars[buf[i] % TempPasswordChars.Length];
        return new string(chars);
    }

    // ── Internal row types ───────────────────────────────────────────────────

    private sealed class AnalyticsOverviewClubStatsRow
    {
        public long UserCount { get; set; }
        public long AssetCount { get; set; }
        public long ActiveLoans { get; set; }
        public long OverdueLoans { get; set; }
    }

    private sealed class AssetByStatusRow
    {
        public string Status { get; set; } = string.Empty;
        public long Total { get; set; }
    }

    private sealed class TotalAssetValueRow
    {
        public decimal TotalValue { get; set; }
    }

    private sealed class AnalyticsLoanTrendRow
    {
        public string Month { get; set; } = string.Empty;
        public long LoanCount { get; set; }
    }

    private sealed class AnalyticsTopAssetRow
    {
        public string AssetName { get; set; } = string.Empty;
        public long LoanCount { get; set; }
    }

    private sealed class AnalyticsAssetsStatusRow
    {
        public string Status { get; set; } = string.Empty;
        public long BatchCount { get; set; }
        public long TotalQty { get; set; }
        public decimal TotalValue { get; set; }
    }

    private sealed class AnalyticsAssetsCategoryRow
    {
        public string Category { get; set; } = string.Empty;
        public long TypeCount { get; set; }
        public long TotalQty { get; set; }
        public decimal TotalValue { get; set; }
    }

    private sealed class AnalyticsGrowthClubRow
    {
        public string Month { get; set; } = string.Empty;
        public long NewClubs { get; set; }
    }

    private sealed class AnalyticsGrowthUserRow
    {
        public string Month { get; set; } = string.Empty;
        public long NewUsers { get; set; }
    }

    private sealed class CountRow
    {
        public long Count { get; set; }
    }

    private sealed class ClubDetailRow
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? SportType { get; set; }
        public string ContactEmail { get; set; } = string.Empty;
        public string? Address { get; set; }
        public bool IsActive { get; set; }
        public DateTime CreatedAt { get; set; }
        public Guid? AdminId { get; set; }
        public string? AdminName { get; set; }
        public string? AdminEmail { get; set; }
        public bool? AdminIsActive { get; set; }
        public bool? AdminEmailVerified { get; set; }
        public long UserCount { get; set; }
        public long AssetCount { get; set; }
        public long ActiveLoanCount { get; set; }
        public long OverdueLoanCount { get; set; }
    }
}
