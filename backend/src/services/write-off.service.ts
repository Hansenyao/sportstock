import * as db from '../db';
import AppError from '../utils/AppError';
import type { PaginatedResult } from '../types';

const WRITE_OFF_SELECT = `
  SELECT wo.*,
         a.name      AS asset_name,
         a.image_url AS asset_image,
         a.brand, a.model, a.size, a.asset_tag,
         u.name      AS created_by_name
  FROM  write_off_orders wo
  JOIN  assets a ON a.id = wo.asset_id
  JOIN  users  u ON u.id = wo.created_by
`;

export async function listWriteOffs(
  clubId: string,
  { asset_id, source, from_date, to_date, page = 1, limit = 20 }: {
    asset_id?: string;
    source?: string;
    from_date?: string;
    to_date?: string;
    page?: number | string;
    limit?: number | string;
  }
): Promise<PaginatedResult<Record<string, unknown>>> {
  const offset = (Number(page) - 1) * Number(limit);
  const conditions = ['wo.club_id = $1'];
  const params: unknown[] = [clubId];

  if (asset_id)  conditions.push(`wo.asset_id = $${params.push(asset_id)}`);
  if (source)    conditions.push(`wo.source = $${params.push(source)}`);
  if (from_date) conditions.push(`wo.created_at >= $${params.push(from_date)}`);
  if (to_date)   conditions.push(`wo.created_at < $${params.push(to_date)}`);

  const where = conditions.join(' AND ');

  const [{ rows }, { rows: countRows }] = await Promise.all([
    db.query<Record<string, unknown>>(
      `${WRITE_OFF_SELECT} WHERE ${where} ORDER BY wo.created_at DESC
       LIMIT $${params.push(Number(limit))} OFFSET $${params.push(offset)}`,
      params
    ),
    db.query<{ count: string }>(`SELECT COUNT(*) FROM write_off_orders wo WHERE ${where}`, params.slice(0, -2)),
  ]);

  return { data: rows, total: parseInt(countRows[0].count), page: Number(page), limit: Number(limit) };
}

export async function getWriteOff(
  id: string,
  clubId: string
): Promise<Record<string, unknown>> {
  const { rows } = await db.query<Record<string, unknown>>(
    `${WRITE_OFF_SELECT} WHERE wo.id = $1 AND wo.club_id = $2`,
    [id, clubId]
  );
  if (!rows.length) throw new AppError('Write-off order not found', 404);
  return rows[0];
}

export async function createWriteOff(
  clubId: string,
  operatorId: string,
  { asset_id, quantity, reason, notes }: {
    asset_id?: string;
    quantity?: number | string;
    reason?: string;
    notes?: string;
  }
): Promise<Record<string, unknown>> {
  if (!asset_id)  throw new AppError('asset_id is required', 400);
  if (!quantity || Number(quantity) < 1) throw new AppError('quantity must be at least 1', 400);

  const qty = Number(quantity);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch asset
    const { rows: assetRows } = await client.query<Record<string, unknown>>(
      'SELECT available_quantity, total_quantity FROM assets WHERE id = $1 AND club_id = $2 AND is_active = true',
      [asset_id, clubId]
    );
    if (!assetRows.length) throw new AppError('Asset not found', 404);

    const availBefore = Number(assetRows[0].available_quantity);
    const totalBefore = Number(assetRows[0].total_quantity);

    if (qty > availBefore) {
      throw new AppError(
        `Cannot write off ${qty} units; only ${availBefore} available in stock`,
        409
      );
    }

    // Deduct from asset
    await client.query(
      `UPDATE assets
       SET available_quantity = available_quantity - $1,
           total_quantity     = total_quantity - $1,
           status = CASE WHEN total_quantity - $1 <= 0 THEN 'retired'::asset_status ELSE status END,
           updated_at = NOW()
       WHERE id = $2`,
      [qty, asset_id]
    );

    // Stock movement
    await client.query(
      `INSERT INTO stock_movements
         (club_id, asset_id, operator_id, type, quantity_delta, quantity_before, quantity_after, notes)
       VALUES ($1,$2,$3,'write_off',$4,$5,$6,$7)`,
      [clubId, asset_id, operatorId, -qty, availBefore, availBefore - qty, reason ?? 'Manual write-off']
    );

    // Write-off order record
    const { rows } = await client.query<Record<string, unknown>>(
      `INSERT INTO write_off_orders (club_id, asset_id, quantity, reason, source, created_by, notes)
       VALUES ($1,$2,$3,$4,'manual',$5,$6) RETURNING *`,
      [clubId, asset_id, qty, reason ?? null, operatorId, notes ?? null]
    );

    await client.query('COMMIT');
    return getWriteOff(rows[0].id as string, clubId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
