using Microsoft.EntityFrameworkCore;
using SportStock.Api.Data;
using SportStock.Api.Dtos.Reports;

namespace SportStock.Api.Services;

// Ports backend/src/services/report.service.ts. All endpoints are read-only
// aggregations; we use db.Database.SqlQuery<T>($"...") with double-quoted
// PascalCase column aliases so EF Core can map directly to flat DTOs
// without per-property HasColumnName boilerplate.
//
// The SQL is intentionally near-identical to the Node version. Anywhere a
// computed/conditional aggregate gets ugly in LINQ (FILTER WHERE,
// TO_CHAR(DATE_TRUNC), EXTRACT(EPOCH), LATERAL join with the depreciation
// function, retirement-alert CASE expression) raw SQL keeps the wire-shape
// parity check tractable.
internal sealed class ReportService(SportStockDbContext db) : IReportService
{
    public async Task<SummaryResponse> GetSummaryAsync(Guid clubId, CancellationToken ct = default)
    {
        var asset = await db.Database.SqlQuery<SummaryAssetRow>($@"
            SELECT
                COUNT(DISTINCT at.id)                                                                AS ""TotalAssets"",
                COALESCE(SUM(ab.total_quantity) FILTER (WHERE at.is_active = true), 0)              AS ""TotalItems"",
                COUNT(ai.id) FILTER (WHERE at.is_active = true AND ai.status = 'available')         AS ""AvailableItems"",
                COALESCE(
                  SUM(ab.purchase_price * ab.total_quantity)
                    FILTER (WHERE at.is_active = true AND ab.purchase_price IS NOT NULL), 0
                )                                                                                    AS ""TotalPurchaseValue"",
                COUNT(ai.id) FILTER (WHERE at.is_active = true AND ai.status != 'retired' AND ai.status != 'written_off') AS ""ActiveTotal"",
                COUNT(ai.id) FILTER (WHERE at.is_active = true AND ai.status = 'available')         AS ""AvailableQty"",
                COUNT(ai.id) FILTER (WHERE at.is_active = true AND ai.status = 'on_loan')           AS ""OnLoanQty"",
                COUNT(ai.id) FILTER (WHERE at.is_active = true AND ai.status = 'maintenance')       AS ""MaintenanceQty"",
                COUNT(ai.id) FILTER (WHERE at.is_active = true AND ai.status = 'retired')           AS ""RetiredQty""
            FROM asset_types at
            LEFT JOIN asset_batches ab ON ab.asset_type_id = at.id
            LEFT JOIN asset_items ai ON ai.asset_type_id = at.id
            WHERE at.club_id = {clubId}").FirstAsync(ct);

        var loan = await db.Database.SqlQuery<SummaryLoanRow>($@"
            SELECT
                COUNT(*)                                          AS ""ActiveLoans"",
                COUNT(*) FILTER (WHERE due_date < CURRENT_DATE)   AS ""OverdueLoans""
            FROM loans WHERE club_id = {clubId} AND status = 'checked_out'").FirstAsync(ct);

        var categories = await db.Database.SqlQuery<CategoryBreakdownRow>($@"
            SELECT
                COALESCE(ac.name, 'Uncategorized')                                         AS ""CategoryName"",
                COUNT(ai.id) FILTER (WHERE ai.status != 'retired' AND ai.status != 'written_off') AS ""TotalQty"",
                COUNT(ai.id) FILTER (WHERE ai.status = 'available')                        AS ""AvailableQty""
            FROM asset_types at
            JOIN asset_names an ON an.id = at.asset_name_id
            LEFT JOIN asset_categories ac ON ac.id = an.category_id
            LEFT JOIN asset_items ai ON ai.asset_type_id = at.id
            WHERE at.club_id = {clubId} AND at.is_active = true AND an.club_id = {clubId}
            GROUP BY ac.id, ac.name
            ORDER BY ""TotalQty"" DESC").ToListAsync(ct);

        return new SummaryResponse
        {
            TotalAssets = asset.TotalAssets,
            TotalItems = asset.TotalItems,
            AvailableItems = asset.AvailableItems,
            TotalPurchaseValue = asset.TotalPurchaseValue,
            ActiveTotal = asset.ActiveTotal,
            AvailableQty = asset.AvailableQty,
            OnLoanQty = asset.OnLoanQty,
            MaintenanceQty = asset.MaintenanceQty,
            RetiredQty = asset.RetiredQty,
            ActiveLoans = loan.ActiveLoans,
            OverdueLoans = loan.OverdueLoans,
            CategoryBreakdown = categories.Select(c => new CategoryBreakdownItem
            {
                CategoryName = c.CategoryName,
                TotalQty = c.TotalQty,
                AvailableQty = c.AvailableQty,
            }).ToList(),
        };
    }

    public async Task<DepreciationReportResponse> GetDepreciationAsync(
        Guid clubId, CancellationToken ct = default)
    {
        var items = await db.Database.SqlQuery<DepreciationRow>($@"
            SELECT ab.id          AS ""BatchId"",
                   an.name        AS ""AssetName"",
                   at.brand       AS ""Brand"",
                   at.model       AS ""Model"",
                   at.size        AS ""Size"",
                   ab.purchase_date AS ""PurchaseDate"",
                   ab.total_quantity AS ""TotalQuantity"",
                   c.name         AS ""CategoryName"",
                   d.purchase_price AS ""PurchasePrice"",
                   d.annual_depreciation AS ""AnnualDepreciation"",
                   d.years_elapsed AS ""YearsElapsed"",
                   d.accumulated_depreciation AS ""AccumulatedDepreciation"",
                   d.net_book_value AS ""NetBookValue""
            FROM asset_batches ab
            JOIN asset_types at ON at.id = ab.asset_type_id
            JOIN asset_names an ON an.id = at.asset_name_id
            JOIN LATERAL get_asset_depreciation(ab.id) d ON true
            LEFT JOIN asset_categories c ON c.id = an.category_id
            WHERE at.club_id = {clubId} AND at.is_active = true
            ORDER BY an.name, ab.purchase_date ASC NULLS LAST").ToListAsync(ct);

        decimal totalPurchase = 0m;
        decimal totalNet = 0m;
        foreach (var r in items)
        {
            totalPurchase += (r.PurchasePrice ?? 0m) * r.TotalQuantity;
            totalNet += (r.NetBookValue ?? 0m) * r.TotalQuantity;
        }

        return new DepreciationReportResponse
        {
            Items = items.Select(r => new DepreciationItem
            {
                BatchId = r.BatchId,
                AssetName = r.AssetName,
                Brand = r.Brand,
                Model = r.Model,
                Size = r.Size,
                PurchaseDate = r.PurchaseDate,
                TotalQuantity = r.TotalQuantity,
                CategoryName = r.CategoryName,
                PurchasePrice = r.PurchasePrice,
                AnnualDepreciation = r.AnnualDepreciation,
                YearsElapsed = r.YearsElapsed,
                AccumulatedDepreciation = r.AccumulatedDepreciation,
                NetBookValue = r.NetBookValue,
            }).ToList(),
            Summary = new DepreciationSummary
            {
                TotalBatchesWithDepreciation = items.Count,
                TotalPurchaseValue = totalPurchase.ToString("F2"),
                TotalNetBookValue = totalNet.ToString("F2"),
                TotalAccumulatedDepreciation = (totalPurchase - totalNet).ToString("F2"),
            },
        };
    }

    public async Task<LoanUsageResponse> GetLoanUsageAsync(
        Guid clubId, LoanUsageQuery query, CancellationToken ct = default)
    {
        // Parameter binding via FormattableString is preserved per-segment;
        // SqlQuery only inlines literals through the interpolated syntax, so
        // we use nullable parameters with IS-NULL fallbacks to keep one SQL
        // string per query.
        Guid? teamFilter = query.TeamId;
        DateTime? fromFilter = query.FromDate;
        DateTime? toFilter = query.ToDate;

        var topAssets = await db.Database.SqlQuery<TopAssetRow>($@"
            SELECT at.id   AS ""Id"",
                   an.name AS ""Name"",
                   COUNT(DISTINCT l.id) AS ""LoanCount"",
                   COALESCE(SUM(li.quantity), 0) AS ""TotalQuantityBorrowed""
            FROM loan_items li
            JOIN loans      l  ON l.id  = li.loan_id
            JOIN asset_types at ON at.id = li.asset_type_id
            JOIN asset_names an ON an.id = at.asset_name_id
            WHERE l.club_id = {clubId} AND l.status != 'pending'
              AND ({teamFilter}::uuid IS NULL OR l.team_id = {teamFilter})
              AND ({fromFilter}::timestamptz IS NULL OR l.created_at >= {fromFilter})
              AND ({toFilter}::timestamptz IS NULL OR l.created_at < {toFilter})
            GROUP BY at.id, an.name
            ORDER BY ""LoanCount"" DESC
            LIMIT 10").ToListAsync(ct);

        var coachSummary = await db.Database.SqlQuery<CoachSummaryRow>($@"
            SELECT u.id   AS ""Id"",
                   (u.first_name || ' ' || u.last_name) AS ""Name"",
                   COUNT(DISTINCT l.id) AS ""LoanCount"",
                   COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'checked_out') AS ""ActiveLoans""
            FROM loans l
            JOIN users u ON u.id = l.coach_id
            WHERE l.club_id = {clubId}
              AND ({teamFilter}::uuid IS NULL OR l.team_id = {teamFilter})
              AND ({fromFilter}::timestamptz IS NULL OR l.created_at >= {fromFilter})
              AND ({toFilter}::timestamptz IS NULL OR l.created_at < {toFilter})
            GROUP BY u.id, u.first_name, u.last_name
            ORDER BY ""LoanCount"" DESC").ToListAsync(ct);

        var monthlyTrend = await db.Database.SqlQuery<MonthlyTrendRow>($@"
            SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS ""Month"",
                   COUNT(*) AS ""LoanCount""
            FROM loans
            WHERE club_id = {clubId}
              AND created_at >= NOW() - INTERVAL '6 months'
              AND ({teamFilter}::uuid IS NULL OR team_id = {teamFilter})
            GROUP BY ""Month""
            ORDER BY ""Month""").ToListAsync(ct);

        TeamSummary teamSummary;
        if (query.TeamId is { } tid)
        {
            var row = await db.Database.SqlQuery<TeamSummaryRow>($@"
                SELECT t.id        AS ""Id"",
                       t.name      AS ""Name"",
                       t.age_group AS ""AgeGroup"",
                       t.gender    AS ""Gender"",
                       COUNT(DISTINCT l.id) AS ""TotalLoans"",
                       COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'checked_out') AS ""ActiveLoans"",
                       COUNT(DISTINCT l.id) FILTER (
                         WHERE l.status = 'checked_out' AND l.due_date < CURRENT_DATE
                       ) AS ""OverdueLoans""
                FROM teams t
                LEFT JOIN loans l ON l.team_id = t.id AND l.club_id = {clubId}
                WHERE t.id = {tid} AND t.club_id = {clubId}
                GROUP BY t.id, t.name, t.age_group, t.gender").FirstOrDefaultAsync(ct);
            teamSummary = row is not null
                ? new TeamSummary
                {
                    Id = row.Id,
                    Name = row.Name ?? string.Empty,
                    AgeGroup = row.AgeGroup,
                    Gender = row.Gender,
                    TotalLoans = row.TotalLoans,
                    ActiveLoans = row.ActiveLoans,
                    OverdueLoans = row.OverdueLoans,
                }
                : new TeamSummary { Id = tid, Name = string.Empty };
        }
        else
        {
            var row = await db.Database.SqlQuery<TeamSummaryAggregateRow>($@"
                SELECT COUNT(DISTINCT id)                                           AS ""TotalLoans"",
                       COUNT(DISTINCT id) FILTER (WHERE status = 'checked_out')    AS ""ActiveLoans"",
                       COUNT(DISTINCT id) FILTER (
                         WHERE status = 'checked_out' AND due_date < CURRENT_DATE
                       ) AS ""OverdueLoans""
                FROM loans WHERE club_id = {clubId}").FirstAsync(ct);
            teamSummary = new TeamSummary
            {
                Id = null,
                Name = "All Teams",
                TotalLoans = row.TotalLoans,
                ActiveLoans = row.ActiveLoans,
                OverdueLoans = row.OverdueLoans,
            };
        }

        return new LoanUsageResponse
        {
            TopAssets = topAssets.Select(r => new TopAssetItem
            {
                Id = r.Id,
                Name = r.Name,
                LoanCount = r.LoanCount,
                TotalQuantityBorrowed = r.TotalQuantityBorrowed,
            }).ToList(),
            CoachSummary = coachSummary.Select(r => new CoachSummaryItem
            {
                Id = r.Id,
                Name = r.Name,
                LoanCount = r.LoanCount,
                ActiveLoans = r.ActiveLoans,
            }).ToList(),
            MonthlyTrend = monthlyTrend.Select(r => new MonthlyTrendItem
            {
                Month = r.Month,
                LoanCount = r.LoanCount,
            }).ToList(),
            TeamSummary = teamSummary,
        };
    }

    public async Task<IReadOnlyList<MovementsSummaryItem>> GetMovementsAsync(
        Guid clubId, MovementsRangeQuery query, CancellationToken ct = default)
    {
        DateTime? fromFilter = query.FromDate;
        DateTime? toFilter = query.ToDate;

        var rows = await db.Database.SqlQuery<MovementsSummaryRow>($@"
            SELECT sm.type::text AS ""Type"",
                   COUNT(*)      AS ""Count"",
                   COALESCE(SUM(ABS(sm.quantity_delta)), 0) AS ""TotalUnits""
            FROM stock_movements sm
            WHERE sm.club_id = {clubId}
              AND ({fromFilter}::timestamptz IS NULL OR sm.created_at >= {fromFilter})
              AND ({toFilter}::timestamptz IS NULL OR sm.created_at < {toFilter})
            GROUP BY sm.type").ToListAsync(ct);

        return rows.Select(r => new MovementsSummaryItem
        {
            Type = r.Type,
            Count = r.Count,
            TotalUnits = r.TotalUnits,
        }).ToList();
    }

    public async Task<IReadOnlyList<RecentMovementItem>> GetRecentMovementsAsync(
        Guid clubId, CancellationToken ct = default)
    {
        var rows = await db.Database.SqlQuery<RecentMovementRow>($@"
            SELECT
                sm.id                          AS ""Id"",
                COALESCE(an.name, 'Unknown')   AS ""AssetTypeName"",
                sm.type::text                  AS ""Type"",
                sm.quantity_delta              AS ""QuantityDelta"",
                sm.created_at                  AS ""CreatedAt""
            FROM stock_movements sm
            LEFT JOIN asset_batches ab ON ab.id  = sm.asset_batch_id
            LEFT JOIN asset_types   at ON at.id  = ab.asset_type_id
            LEFT JOIN asset_names   an ON an.id  = at.asset_name_id
            WHERE sm.club_id = {clubId}
            ORDER BY sm.created_at DESC
            LIMIT 10").ToListAsync(ct);

        return rows.Select(r => new RecentMovementItem
        {
            Id = r.Id,
            AssetTypeName = r.AssetTypeName,
            Type = r.Type,
            QuantityDelta = r.QuantityDelta,
            CreatedAt = r.CreatedAt,
        }).ToList();
    }

    public async Task<AlertsResponse> GetAlertsAsync(Guid clubId, CancellationToken ct = default)
    {
        var retirement = await db.Database.SqlQuery<RetirementRiskRow>($@"
            SELECT
                ab.id                AS ""BatchId"",
                an.name              AS ""AssetName"",
                at.brand             AS ""Brand"",
                at.model             AS ""Model"",
                at.size              AS ""Size"",
                ab.purchase_date     AS ""PurchaseDate"",
                ab.useful_life_years AS ""UsefulLifeYears"",
                ab.total_quantity    AS ""TotalQuantity"",
                ROUND(
                    EXTRACT(EPOCH FROM (NOW() - ab.purchase_date))
                    / (ab.useful_life_years * 365.25 * 86400) * 100
                )::int               AS ""LifeUsedPercent""
            FROM asset_batches ab
            JOIN asset_types at ON at.id = ab.asset_type_id
            JOIN asset_names  an ON an.id = at.asset_name_id
            JOIN clubs         c  ON c.id  = at.club_id
            WHERE at.club_id = {clubId}
              AND at.is_active = true
              AND ab.purchase_date     IS NOT NULL
              AND ab.useful_life_years IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM asset_items ai
                WHERE ai.batch_id = ab.id AND ai.status != 'retired' AND ai.status != 'written_off'
              )
              AND (
                CASE
                  WHEN c.retirement_alert_mode = 'percent' THEN
                    EXTRACT(EPOCH FROM (NOW() - ab.purchase_date))
                    / (ab.useful_life_years * 365.25 * 86400) * 100
                    >= c.retirement_alert_value
                  ELSE
                    ab.useful_life_years * 12
                    - EXTRACT(EPOCH FROM (NOW() - ab.purchase_date)) / (30.4375 * 86400)
                    <= c.retirement_alert_value
                END
              )
            ORDER BY ""LifeUsedPercent"" DESC").ToListAsync(ct);

        var lowStock = await db.Database.SqlQuery<LowStockRow>($@"
            SELECT
                at.id                                                                    AS ""AssetTypeId"",
                an.name                                                                  AS ""AssetName"",
                at.brand                                                                 AS ""Brand"",
                at.model                                                                 AS ""Model"",
                at.size                                                                  AS ""Size"",
                COUNT(ai.id) FILTER (WHERE ai.status != 'retired' AND ai.status != 'written_off') AS ""TotalQty"",
                COUNT(ai.id) FILTER (WHERE ai.status = 'available')                      AS ""AvailableQty"",
                COALESCE(at.low_stock_threshold, c.low_stock_threshold)                 AS ""EffectiveThreshold""
            FROM asset_types at
            JOIN asset_names an ON an.id = at.asset_name_id AND an.club_id = {clubId}
            JOIN clubs        c  ON c.id  = at.club_id
            LEFT JOIN asset_items ai ON ai.asset_type_id = at.id
            WHERE at.club_id = {clubId} AND at.is_active = true
            GROUP BY at.id, an.name, at.brand, at.model, at.size,
                     at.low_stock_threshold, c.low_stock_threshold
            HAVING
                COUNT(ai.id) FILTER (WHERE ai.status = 'available')
                <= COALESCE(at.low_stock_threshold, c.low_stock_threshold)
            ORDER BY ""AvailableQty"" ASC").ToListAsync(ct);

        return new AlertsResponse
        {
            RetirementRisk = retirement.Select(r => new RetirementRiskItem
            {
                BatchId = r.BatchId,
                AssetName = r.AssetName,
                Brand = r.Brand,
                Model = r.Model,
                Size = r.Size,
                PurchaseDate = r.PurchaseDate,
                UsefulLifeYears = r.UsefulLifeYears,
                TotalQuantity = r.TotalQuantity,
                LifeUsedPercent = r.LifeUsedPercent,
            }).ToList(),
            LowStock = lowStock.Select(r => new LowStockItem
            {
                AssetTypeId = r.AssetTypeId,
                AssetName = r.AssetName,
                Brand = r.Brand,
                Model = r.Model,
                Size = r.Size,
                TotalQty = r.TotalQty,
                AvailableQty = r.AvailableQty,
                EffectiveThreshold = r.EffectiveThreshold,
            }).ToList(),
            TotalAlertCount = retirement.Count + lowStock.Count,
        };
    }

    // ── Internal row types (one per SQL projection) ──────────────────────────
    // SqlQuery<T> maps reader columns to public properties by name. We declare
    // these as nested classes so they stay out of the public Dtos namespace.

    private sealed class SummaryAssetRow
    {
        public long TotalAssets { get; set; }
        public long TotalItems { get; set; }
        public long AvailableItems { get; set; }
        public decimal TotalPurchaseValue { get; set; }
        public long ActiveTotal { get; set; }
        public long AvailableQty { get; set; }
        public long OnLoanQty { get; set; }
        public long MaintenanceQty { get; set; }
        public long RetiredQty { get; set; }
    }

    private sealed class SummaryLoanRow
    {
        public long ActiveLoans { get; set; }
        public long OverdueLoans { get; set; }
    }

    private sealed class CategoryBreakdownRow
    {
        public string CategoryName { get; set; } = string.Empty;
        public long TotalQty { get; set; }
        public long AvailableQty { get; set; }
    }

    private sealed class DepreciationRow
    {
        public Guid BatchId { get; set; }
        public string AssetName { get; set; } = string.Empty;
        public string? Brand { get; set; }
        public string? Model { get; set; }
        public string? Size { get; set; }
        public DateOnly? PurchaseDate { get; set; }
        public int TotalQuantity { get; set; }
        public string? CategoryName { get; set; }
        public decimal? PurchasePrice { get; set; }
        public decimal? AnnualDepreciation { get; set; }
        public decimal? YearsElapsed { get; set; }
        public decimal? AccumulatedDepreciation { get; set; }
        public decimal? NetBookValue { get; set; }
    }

    private sealed class TopAssetRow
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public long LoanCount { get; set; }
        public long TotalQuantityBorrowed { get; set; }
    }

    private sealed class CoachSummaryRow
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public long LoanCount { get; set; }
        public long ActiveLoans { get; set; }
    }

    private sealed class MonthlyTrendRow
    {
        public string Month { get; set; } = string.Empty;
        public long LoanCount { get; set; }
    }

    private sealed class TeamSummaryRow
    {
        public Guid Id { get; set; }
        public string? Name { get; set; }
        public string? AgeGroup { get; set; }
        public string? Gender { get; set; }
        public long TotalLoans { get; set; }
        public long ActiveLoans { get; set; }
        public long OverdueLoans { get; set; }
    }

    private sealed class TeamSummaryAggregateRow
    {
        public long TotalLoans { get; set; }
        public long ActiveLoans { get; set; }
        public long OverdueLoans { get; set; }
    }

    private sealed class MovementsSummaryRow
    {
        public string Type { get; set; } = string.Empty;
        public long Count { get; set; }
        public long TotalUnits { get; set; }
    }

    private sealed class RecentMovementRow
    {
        public Guid Id { get; set; }
        public string AssetTypeName { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
        public int QuantityDelta { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    private sealed class RetirementRiskRow
    {
        public Guid BatchId { get; set; }
        public string AssetName { get; set; } = string.Empty;
        public string? Brand { get; set; }
        public string? Model { get; set; }
        public string? Size { get; set; }
        public DateOnly PurchaseDate { get; set; }
        public int UsefulLifeYears { get; set; }
        public int TotalQuantity { get; set; }
        public int LifeUsedPercent { get; set; }
    }

    private sealed class LowStockRow
    {
        public Guid AssetTypeId { get; set; }
        public string AssetName { get; set; } = string.Empty;
        public string? Brand { get; set; }
        public string? Model { get; set; }
        public string? Size { get; set; }
        public long TotalQty { get; set; }
        public long AvailableQty { get; set; }
        public int EffectiveThreshold { get; set; }
    }
}
