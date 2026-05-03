import * as db from '../db';
import AppError from '../utils/AppError';
import type { PaginatedResult } from '../types';

const WRITE_OFF_SELECT = `
  SELECT wo.*,
         an.name      AS asset_name,
         at.image_url AS asset_image,
         at.brand, at.model, at.size,
         u.name       AS created_by_name
  FROM  write_off_orders wo
  JOIN  asset_types  at ON at.id = wo.asset_type_id
  JOIN  asset_names  an ON an.id = at.asset_name_id
  JOIN  users        u  ON u.id  = wo.created_by
`;

export async function listWriteOffs(
  clubId: string,
  { asset_type_id, source, from_date, to_date, page = 1, limit = 20 }: {
    asset_type_id?: string;
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

  if (asset_type_id) conditions.push(`wo.asset_type_id = $${params.push(asset_type_id)}`);
  if (source)        conditions.push(`wo.source = $${params.push(source)}`);
  if (from_date)     conditions.push(`wo.created_at >= $${params.push(from_date)}`);
  if (to_date)       conditions.push(`wo.created_at < $${params.push(to_date)}`);

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
  { asset_type_id, quantity, reason, notes }: {
    asset_type_id?: string;
    quantity?: number | string;
    reason?: string;
    notes?: string;
  }
): Promise<Record<string, unknown>> {
  if (!asset_type_id) throw new AppError('asset_type_id is required', 400);
  if (!quantity || Number(quantity) < 1) throw new AppError('quantity must be at least 1', 400);

  const qty = Number(quantity);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Verify asset type belongs to this club and get available batches FIFO
    const { rows: batchRows } = await client.query<{ id: string; available_quantity: number }>(
      `SELECT ab.id, ab.available_quantity
       FROM asset_batches ab
       JOIN asset_types at ON at.id = ab.asset_type_id
       WHERE ab.asset_type_id = $1 AND at.club_id = $2
         AND ab.available_quantity > 0 AND ab.status != 'retired'
       ORDER BY ab.purchase_date ASC NULLS LAST, ab.created_at ASC`,
      [asset_type_id, clubId]
    );

    if (!batchRows.length) throw new AppError('Asset not found or no available stock', 404);

    const totalAvail = batchRows.reduce((s, r) => s + Number(r.available_quantity), 0);
    if (qty > totalAvail) {
      throw new AppError(
        `Cannot write off ${qty} units; only ${totalAvail} available in stock`,
        409
      );
    }

    // Deduct FIFO across batches
    let remaining = qty;
    for (const batch of batchRows) {
      if (remaining <= 0) break;
      const deduct = Math.min(remaining, Number(batch.available_quantity));
      remaining -= deduct;
      const availBefore = Number(batch.available_quantity);

      await client.query(
        `UPDATE asset_batches
         SET available_quantity = available_quantity - $1,
             total_quantity     = total_quantity - $1,
             updated_at         = NOW()
         WHERE id = $2`,
        [deduct, batch.id]
      );
      await client.query(
        `INSERT INTO stock_movements
           (club_id, asset_batch_id, operator_id, type, quantity_delta, quantity_before, quantity_after, notes)
         VALUES ($1,$2,$3,'write_off',$4,$5,$6,$7)`,
        [clubId, batch.id, operatorId, -deduct, availBefore, availBefore - deduct, reason ?? 'Manual write-off']
      );
    }

    const { rows } = await client.query<Record<string, unknown>>(
      `INSERT INTO write_off_orders (club_id, asset_type_id, quantity, reason, source, created_by, notes)
       VALUES ($1,$2,$3,$4,'manual',$5,$6) RETURNING *`,
      [clubId, asset_type_id, qty, reason ?? null, operatorId, notes ?? null]
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
