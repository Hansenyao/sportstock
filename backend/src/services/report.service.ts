import * as db from '../db';

export async function getSummary(clubId: string): Promise<Record<string, unknown>> {
  const [{ rows: assetRows }, { rows: loanRows }, { rows: categoryRows }] = await Promise.all([
    db.query<Record<string, unknown>>(
      `SELECT
         COUNT(DISTINCT at.id)                                                            AS total_assets,
         COALESCE(SUM(ab.total_quantity)     FILTER (WHERE at.is_active = true), 0)      AS total_items,
         COALESCE(SUM(ab.available_quantity) FILTER (WHERE at.is_active = true), 0)      AS available_items,
         COALESCE(
           SUM(ab.purchase_price * ab.total_quantity)
           FILTER (WHERE at.is_active = true AND ab.purchase_price IS NOT NULL), 0
         )                                                                                AS total_purchase_value,
         COALESCE(SUM(ab.total_quantity)
           FILTER (WHERE at.is_active = true AND ab.status != 'retired'), 0)             AS active_total,
         COALESCE(SUM(ab.available_quantity)
           FILTER (WHERE at.is_active = true AND ab.status != 'retired'), 0)             AS available_qty,
         COALESCE(SUM(ab.total_quantity)
           FILTER (WHERE at.is_active = true AND ab.status = 'on_loan'), 0)              AS on_loan_qty,
         COALESCE(SUM(ab.total_quantity)
           FILTER (WHERE at.is_active = true AND ab.status = 'maintenance'), 0)          AS maintenance_qty,
         COALESCE(SUM(ab.total_quantity)
           FILTER (WHERE at.is_active = true AND ab.status = 'retired'), 0)              AS retired_qty
       FROM asset_types at
       LEFT JOIN asset_batches ab ON ab.asset_type_id = at.id
       WHERE at.club_id = $1`,
      [clubId]
    ),
    db.query<Record<string, unknown>>(
      `SELECT
         COUNT(*)                                         AS active_loans,
         COUNT(*) FILTER (WHERE due_date < CURRENT_DATE) AS overdue_loans
       FROM loans WHERE club_id = $1 AND status = 'checked_out'`,
      [clubId]
    ),
    db.query<Record<string, unknown>>(
      `SELECT
         COALESCE(ac.name, 'Uncategorized')               AS category_name,
         COALESCE(SUM(ab.total_quantity)
           FILTER (WHERE ab.status != 'retired'), 0)      AS total_qty,
         COALESCE(SUM(ab.available_quantity)
           FILTER (WHERE ab.status != 'retired'), 0)      AS available_qty
       FROM asset_types at
       JOIN asset_names an ON an.id = at.asset_name_id
       LEFT JOIN asset_categories ac ON ac.id = an.category_id
       LEFT JOIN asset_batches ab ON ab.asset_type_id = at.id
       WHERE at.club_id = $1 AND at.is_active = true
       GROUP BY ac.id, ac.name
       ORDER BY total_qty DESC`,
      [clubId]
    ),
  ]);

  const asset = assetRows[0];
  const loan  = loanRows[0];

  return {
    ...asset,
    ...loan,
    active_total:    Number(asset.active_total),
    available_qty:   Number(asset.available_qty),
    on_loan_qty:     Number(asset.on_loan_qty),
    maintenance_qty: Number(asset.maintenance_qty),
    retired_qty:     Number(asset.retired_qty),
    category_breakdown: categoryRows.map((r) => ({
      ...r,
      total_qty:     Number(r.total_qty),
      available_qty: Number(r.available_qty),
    })),
  };
}

export async function getDepreciationReport(clubId: string): Promise<{
  items: Record<string, unknown>[];
  summary: {
    total_batches_with_depreciation: number;
    total_purchase_value: string;
    total_net_book_value: string;
    total_accumulated_depreciation: string;
  };
}> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT ab.id          AS batch_id,
            an.name        AS asset_name,
            at.brand, at.model, at.size,
            ab.status      AS batch_status,
            ab.purchase_date,
            ab.total_quantity,
            c.name         AS category_name,
            d.purchase_price, d.annual_depreciation,
            d.years_elapsed, d.accumulated_depreciation, d.net_book_value
     FROM asset_batches ab
     JOIN asset_types at ON at.id = ab.asset_type_id
     JOIN asset_names an ON an.id = at.asset_name_id
     JOIN LATERAL get_asset_depreciation(ab.id) d ON true
     LEFT JOIN asset_categories c ON c.id = an.category_id
     WHERE at.club_id = $1 AND at.is_active = true
     ORDER BY an.name, ab.purchase_date ASC NULLS LAST`,
    [clubId]
  );

  const totalPurchase = rows.reduce((s, r) => s + parseFloat(String(r.purchase_price || 0)), 0);
  const totalNet      = rows.reduce((s, r) => s + parseFloat(String(r.net_book_value   || 0)), 0);

  return {
    items: rows,
    summary: {
      total_batches_with_depreciation: rows.length,
      total_purchase_value:            totalPurchase.toFixed(2),
      total_net_book_value:            totalNet.toFixed(2),
      total_accumulated_depreciation:  (totalPurchase - totalNet).toFixed(2),
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
      `SELECT at.id, an.name,
              COUNT(DISTINCT l.id) AS loan_count,
              SUM(li.quantity)     AS total_quantity_borrowed
       FROM loan_items li
       JOIN loans      l  ON l.id  = li.loan_id
       JOIN asset_types at ON at.id = li.asset_type_id
       JOIN asset_names an ON an.id = at.asset_name_id
       WHERE l.club_id = $1 AND l.status != 'pending' ${dateWhere}
       GROUP BY at.id, an.name
       ORDER BY loan_count DESC
       LIMIT 10`,
      params
    ),
    db.query<Record<string, unknown>>(
      `SELECT u.id, u.name,
              COUNT(DISTINCT l.id)                                       AS loan_count,
              COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'checked_out') AS active_loans
       FROM loans l
       JOIN users u ON u.id = l.coach_id
       WHERE l.club_id = $1 ${dateWhere}
       GROUP BY u.id, u.name
       ORDER BY loan_count DESC`,
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
