import * as db from '../db';

export async function getSummary(clubId: string): Promise<Record<string, unknown>> {
  const [{ rows: assetRows }, { rows: loanRows }] = await Promise.all([
    db.query<Record<string, unknown>>(
      `SELECT
         COUNT(*)                                                              AS total_assets,
         COALESCE(SUM(total_quantity)     FILTER (WHERE is_active = true), 0) AS total_items,
         COALESCE(SUM(available_quantity) FILTER (WHERE is_active = true), 0) AS available_items,
         COUNT(*) FILTER (WHERE status = 'on_loan')                           AS on_loan_count,
         COUNT(*) FILTER (WHERE status = 'maintenance')                       AS maintenance_count,
         COUNT(*) FILTER (WHERE status = 'retired')                           AS retired_count,
         COALESCE(
           SUM(purchase_price * total_quantity)
           FILTER (WHERE is_active = true AND purchase_price IS NOT NULL), 0
         )                                                                    AS total_purchase_value
       FROM assets WHERE club_id = $1`,
      [clubId]
    ),
    db.query<Record<string, unknown>>(
      `SELECT
         COUNT(*)                                         AS active_loans,
         COUNT(*) FILTER (WHERE due_date < CURRENT_DATE) AS overdue_loans
       FROM loans WHERE club_id = $1 AND status = 'checked_out'`,
      [clubId]
    ),
  ]);
  return { ...assetRows[0], ...loanRows[0] };
}

export async function getDepreciationReport(clubId: string): Promise<{
  items: Record<string, unknown>[];
  summary: {
    total_assets_with_depreciation: number;
    total_purchase_value: string;
    total_net_book_value: string;
    total_accumulated_depreciation: string;
  };
}> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT a.id, a.name, a.status,
            c.name AS category_name,
            d.purchase_price, d.annual_depreciation,
            d.years_elapsed, d.accumulated_depreciation, d.net_book_value
     FROM assets a
     JOIN LATERAL get_asset_depreciation(a.id) d ON true
     LEFT JOIN asset_categories c ON c.id = a.category_id
     WHERE a.club_id = $1 AND a.is_active = true
     ORDER BY a.name`,
    [clubId]
  );

  const totalPurchase = rows.reduce((s, r) => s + parseFloat(String(r.purchase_price || 0)), 0);
  const totalNet      = rows.reduce((s, r) => s + parseFloat(String(r.net_book_value   || 0)), 0);

  return {
    items: rows,
    summary: {
      total_assets_with_depreciation: rows.length,
      total_purchase_value:           totalPurchase.toFixed(2),
      total_net_book_value:           totalNet.toFixed(2),
      total_accumulated_depreciation: (totalPurchase - totalNet).toFixed(2),
    },
  };
}

export async function getLoanUsage(
  clubId: string,
  { from_date, to_date }: { from_date?: string; to_date?: string }
): Promise<{
  top_assets: Record<string, unknown>[];
  coach_summary: Record<string, unknown>[];
  monthly_trend: Record<string, unknown>[];
}> {
  const params: unknown[] = [clubId];
  const dateFilters: string[] = [];
  if (from_date) dateFilters.push(`l.created_at >= $${params.push(from_date)}`);
  if (to_date)   dateFilters.push(`l.created_at <  $${params.push(to_date)}`);
  const dateWhere = dateFilters.length ? ' AND ' + dateFilters.join(' AND ') : '';

  const [topAssets, coachSummary, monthlyTrend] = await Promise.all([
    db.query<Record<string, unknown>>(
      `SELECT a.id, a.name,
              COUNT(l.id)     AS loan_count,
              SUM(l.quantity) AS total_quantity_borrowed
       FROM loans l JOIN assets a ON a.id = l.asset_id
       WHERE l.club_id = $1 AND l.status != 'pending' ${dateWhere}
       GROUP BY a.id, a.name ORDER BY loan_count DESC LIMIT 10`,
      params
    ),
    db.query<Record<string, unknown>>(
      `SELECT u.id, u.name,
              COUNT(l.id)                                                   AS loan_count,
              COUNT(*) FILTER (WHERE l.status = 'checked_out')              AS active_loans,
              COUNT(*) FILTER (WHERE l.return_condition = 'severe_damage')  AS damage_incidents
       FROM loans l JOIN users u ON u.id = l.coach_id
       WHERE l.club_id = $1 ${dateWhere}
       GROUP BY u.id, u.name ORDER BY loan_count DESC`,
      params
    ),
    db.query<Record<string, unknown>>(
      `SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month, COUNT(*) AS loan_count
       FROM loans
       WHERE club_id = $1 AND created_at >= NOW() - INTERVAL '6 months'
       GROUP BY month ORDER BY month`,
      [clubId]
    ),
  ]);

  return {
    top_assets:    topAssets.rows,
    coach_summary: coachSummary.rows,
    monthly_trend: monthlyTrend.rows,
  };
}

export async function getMovementsSummary(
  clubId: string,
  { from_date, to_date }: { from_date?: string; to_date?: string }
): Promise<Record<string, unknown>[]> {
  const conditions = ['sm.club_id = $1'];
  const params: unknown[] = [clubId];
  if (from_date) conditions.push(`sm.created_at >= $${params.push(from_date)}`);
  if (to_date)   conditions.push(`sm.created_at <  $${params.push(to_date)}`);

  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT sm.type, COUNT(*) AS count, SUM(ABS(sm.quantity_delta)) AS total_units
     FROM stock_movements sm WHERE ${conditions.join(' AND ')} GROUP BY sm.type`,
    params
  );
  return rows;
}
