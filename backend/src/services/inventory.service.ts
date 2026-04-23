import * as db from '../db';
import AppError from '../utils/AppError';
import type { PaginatedResult } from '../types';

async function _assertAssetBelongsToClub(assetId: string, clubId: string): Promise<void> {
  const { rows } = await db.query<{ id: string }>(
    'SELECT id FROM assets WHERE id = $1 AND club_id = $2',
    [assetId, clubId]
  );
  if (!rows.length) throw new AppError('Asset not found', 404);
}

export async function listMovements(
  clubId: string,
  { asset_id, type, from_date, to_date, page = 1, limit = 20 }: {
    asset_id?: string;
    type?: string;
    from_date?: string;
    to_date?: string;
    page?: number | string;
    limit?: number | string;
  }
): Promise<PaginatedResult<Record<string, unknown>>> {
  const offset = (Number(page) - 1) * Number(limit);
  const conditions = ['sm.club_id = $1'];
  const params: unknown[] = [clubId];

  if (asset_id)  conditions.push(`sm.asset_id = $${params.push(asset_id)}`);
  if (type)      conditions.push(`sm.type = $${params.push(type)}`);
  if (from_date) conditions.push(`sm.created_at >= $${params.push(from_date)}`);
  if (to_date)   conditions.push(`sm.created_at < $${params.push(to_date)}`);

  const where = conditions.join(' AND ');
  const [{ rows }, { rows: countRows }] = await Promise.all([
    db.query<Record<string, unknown>>(
      `SELECT sm.*, a.name AS asset_name, u.name AS operator_name
       FROM stock_movements sm
       JOIN assets a ON a.id = sm.asset_id
       LEFT JOIN users u ON u.id = sm.operator_id
       WHERE ${where} ORDER BY sm.created_at DESC
       LIMIT $${params.push(Number(limit))} OFFSET $${params.push(offset)}`,
      params
    ),
    db.query<{ count: string }>(`SELECT COUNT(*) FROM stock_movements sm WHERE ${where}`, params.slice(0, -2)),
  ]);
  return { data: rows, total: parseInt(countRows[0].count), page: Number(page), limit: Number(limit) };
}

export async function purchaseStock(
  clubId: string,
  operatorId: string,
  assetId: string,
  quantity: number | string,
  notes?: string
): Promise<Record<string, unknown>> {
  if (!quantity || Number(quantity) < 1) throw new AppError('Positive quantity is required', 400);
  await _assertAssetBelongsToClub(assetId, clubId);
  await db.query('CALL purchase_stock($1, $2, $3, $4)', [assetId, operatorId, Number(quantity), notes ?? null]);
  const { rows } = await db.query<Record<string, unknown>>('SELECT * FROM assets WHERE id = $1', [assetId]);
  return rows[0];
}

export async function adjustStock(
  clubId: string,
  operatorId: string,
  assetId: string,
  quantityDelta: number | string | null | undefined,
  notes?: string
): Promise<Record<string, unknown>> {
  if (quantityDelta === undefined || quantityDelta === null) {
    throw new AppError('quantity_delta is required', 400);
  }
  await _assertAssetBelongsToClub(assetId, clubId);

  const { rows: assetRows } = await db.query<Record<string, unknown>>('SELECT * FROM assets WHERE id = $1', [assetId]);
  const asset = assetRows[0];
  const delta = parseInt(String(quantityDelta));
  const newQty = Number(asset.available_quantity) + delta;

  if (newQty < 0) throw new AppError('Adjustment would result in negative available quantity', 409);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE assets SET
         available_quantity = available_quantity + $1,
         total_quantity = GREATEST(total_quantity + $1, 0)
       WHERE id = $2`,
      [delta, assetId]
    );
    await client.query(
      `INSERT INTO stock_movements
         (club_id, asset_id, operator_id, type, quantity_delta, quantity_before, quantity_after, notes)
       VALUES ($1,$2,$3,'adjustment',$4,$5,$6,$7)`,
      [clubId, assetId, operatorId, delta, asset.available_quantity, newQty, notes ?? 'Manual adjustment']
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const { rows } = await db.query<Record<string, unknown>>('SELECT * FROM assets WHERE id = $1', [assetId]);
  return rows[0];
}

export async function retireAsset(
  clubId: string,
  operatorId: string,
  assetId: string,
  quantity: number | string,
  notes?: string
): Promise<Record<string, unknown>> {
  if (!quantity || Number(quantity) < 1) throw new AppError('Positive quantity is required', 400);
  await _assertAssetBelongsToClub(assetId, clubId);
  try {
    await db.query('CALL retire_asset($1, $2, $3, $4)', [assetId, operatorId, Number(quantity), notes ?? null]);
  } catch (err) {
    const anyErr = err as { message?: string };
    if (anyErr.message?.includes('Cannot retire')) throw new AppError(anyErr.message, 409);
    throw err;
  }
  const { rows } = await db.query<Record<string, unknown>>('SELECT * FROM assets WHERE id = $1', [assetId]);
  return rows[0];
}

export async function completeMaintenance(
  clubId: string,
  operatorId: string,
  assetId: string,
  quantityRestored: number | string | null | undefined,
  notes?: string
): Promise<Record<string, unknown>> {
  if (quantityRestored === undefined || quantityRestored === null) {
    throw new AppError('quantity_restored is required', 400);
  }
  await _assertAssetBelongsToClub(assetId, clubId);
  try {
    await db.query('CALL complete_maintenance($1, $2, $3, $4)', [assetId, operatorId, Number(quantityRestored), notes ?? null]);
  } catch (err) {
    const anyErr = err as { message?: string };
    if (anyErr.message?.includes('not in maintenance status')) throw new AppError(anyErr.message, 409);
    throw err;
  }
  const { rows } = await db.query<Record<string, unknown>>('SELECT * FROM assets WHERE id = $1', [assetId]);
  return rows[0];
}

export async function listStocktakes(
  clubId: string,
  { page = 1, limit = 10 }: { page?: number | string; limit?: number | string }
): Promise<Record<string, unknown>[]> {
  const offset = (Number(page) - 1) * Number(limit);
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT ss.*, u.name AS conducted_by_name
     FROM stocktake_sessions ss
     JOIN users u ON u.id = ss.conducted_by
     WHERE ss.club_id = $1
     ORDER BY ss.started_at DESC LIMIT $2 OFFSET $3`,
    [clubId, Number(limit), offset]
  );
  return rows;
}

export async function createStocktake(
  clubId: string,
  conductedBy: string,
  notes?: string
): Promise<Record<string, unknown>> {
  const { rows } = await db.query<Record<string, unknown>>(
    'INSERT INTO stocktake_sessions (club_id, conducted_by, notes) VALUES ($1,$2,$3) RETURNING *',
    [clubId, conductedBy, notes ?? null]
  );
  return rows[0];
}

export async function getStocktake(sessionId: string, clubId: string): Promise<Record<string, unknown>> {
  const { rows: sessionRows } = await db.query<Record<string, unknown>>(
    'SELECT * FROM stocktake_sessions WHERE id = $1 AND club_id = $2',
    [sessionId, clubId]
  );
  if (!sessionRows.length) throw new AppError('Stocktake session not found', 404);

  const { rows: itemRows } = await db.query<Record<string, unknown>>(
    `SELECT si.*, a.name AS asset_name, a.available_quantity AS current_quantity
     FROM stocktake_items si JOIN assets a ON a.id = si.asset_id
     WHERE si.session_id = $1 ORDER BY a.name`,
    [sessionId]
  );
  return { ...sessionRows[0], items: itemRows };
}

export async function updateStocktake(
  sessionId: string,
  clubId: string,
  { items, status, notes }: {
    items?: { asset_id?: string; physical_quantity?: number; notes?: string }[];
    status?: string;
    notes?: string;
  }
): Promise<Record<string, unknown>> {
  const { rows: sessionRows } = await db.query<Record<string, unknown>>(
    'SELECT * FROM stocktake_sessions WHERE id = $1 AND club_id = $2',
    [sessionId, clubId]
  );
  if (!sessionRows.length) throw new AppError('Stocktake session not found', 404);
  if (sessionRows[0].status !== 'in_progress') throw new AppError('Session is not in progress', 409);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    if (Array.isArray(items)) {
      for (const item of items) {
        if (!item.asset_id || item.physical_quantity === undefined) continue;
        const { rows: assetRows } = await client.query<{ available_quantity: number }>(
          'SELECT available_quantity FROM assets WHERE id = $1 AND club_id = $2',
          [item.asset_id, clubId]
        );
        if (!assetRows.length) continue;
        await client.query(
          `INSERT INTO stocktake_items (session_id, asset_id, system_quantity, physical_quantity, notes)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (session_id, asset_id)
             DO UPDATE SET physical_quantity = EXCLUDED.physical_quantity, notes = EXCLUDED.notes`,
          [sessionId, item.asset_id, assetRows[0].available_quantity, item.physical_quantity, item.notes ?? null]
        );
      }
    }
    if (status === 'completed' || status === 'cancelled') {
      await client.query(
        `UPDATE stocktake_sessions SET status = $1, completed_at = NOW(), notes = COALESCE($2, notes) WHERE id = $3`,
        [status, notes ?? null, sessionId]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const { rows } = await db.query<Record<string, unknown>>('SELECT * FROM stocktake_sessions WHERE id = $1', [sessionId]);
  return rows[0];
}
