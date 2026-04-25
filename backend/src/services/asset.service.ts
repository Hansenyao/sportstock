import { parse } from 'csv-parse/sync';
import * as db from '../db';
import * as storage from './storage';
import AppError from '../utils/AppError';
import type { PaginatedResult } from '../types';

export async function listCategories(clubId: string): Promise<Record<string, unknown>[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT * FROM asset_categories
     WHERE club_id IS NULL OR club_id = $1
     ORDER BY is_system DESC, name ASC`,
    [clubId]
  );
  return rows;
}

export async function createCategory(clubId: string, name: string): Promise<Record<string, unknown>> {
  if (!name?.trim()) throw new AppError('name is required', 400);
  try {
    const { rows } = await db.query<Record<string, unknown>>(
      'INSERT INTO asset_categories (club_id, name) VALUES ($1, $2) RETURNING *',
      [clubId, name.trim()]
    );
    return rows[0];
  } catch (err) {
    const anyErr = err as Record<string, unknown>;
    if (anyErr.code === '23505') throw new AppError('Category name already exists', 409);
    throw err;
  }
}

export async function listAssets(
  clubId: string,
  { category_id, status, search, page = 1, limit = 20 }: {
    category_id?: string;
    status?: string;
    search?: string;
    page?: number | string;
    limit?: number | string;
  }
): Promise<PaginatedResult<Record<string, unknown>>> {
  const offset = (Number(page) - 1) * Number(limit);
  const conditions = ['a.club_id = $1', 'a.is_active = true'];
  const params: unknown[] = [clubId];

  if (category_id) conditions.push(`a.category_id = $${params.push(category_id)}`);
  if (status)      conditions.push(`a.status = $${params.push(status)}`);
  if (search)      conditions.push(`a.name ILIKE $${params.push('%' + search + '%')}`);

  const where = conditions.join(' AND ');
  const [{ rows }, { rows: countRows }] = await Promise.all([
    db.query<Record<string, unknown>>(
      `SELECT a.*, c.name AS category_name
       FROM assets a LEFT JOIN asset_categories c ON c.id = a.category_id
       WHERE ${where} ORDER BY a.name ASC
       LIMIT $${params.push(Number(limit))} OFFSET $${params.push(offset)}`,
      params
    ),
    db.query<{ count: string }>(`SELECT COUNT(*) FROM assets a WHERE ${where}`, params.slice(0, -2)),
  ]);
  return { data: rows, total: parseInt(countRows[0].count), page: Number(page), limit: Number(limit) };
}

export async function createAsset(
  clubId: string,
  operatorId: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const {
    name, category_id, total_quantity = 1,
    brand, model, size, purchase_date, purchase_price,
    useful_life_years, notes, low_stock_threshold,
  } = data;

  if (!String(name ?? '').trim()) throw new AppError('name is required', 400);
  if (Number(total_quantity) < 1) throw new AppError('total_quantity must be at least 1', 400);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<Record<string, unknown>>(
      `INSERT INTO assets
         (club_id, category_id, name, total_quantity, available_quantity, status,
          brand, model, size, purchase_date, purchase_price, useful_life_years, notes, low_stock_threshold)
       VALUES ($1,$2,$3,$4,$4,'available',$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        clubId, category_id ?? null, String(name).trim(), Number(total_quantity),
        brand ?? null, model ?? null, size ?? null, purchase_date ?? null,
        purchase_price != null ? parseFloat(String(purchase_price)) : null,
        useful_life_years != null ? parseInt(String(useful_life_years)) : null,
        notes ?? null,
        low_stock_threshold != null ? parseInt(String(low_stock_threshold)) : null,
      ]
    );
    const asset = rows[0];
    await client.query(
      `INSERT INTO stock_movements
         (club_id, asset_id, operator_id, type, quantity_delta, quantity_before, quantity_after, notes)
       VALUES ($1,$2,$3,'purchase',$4,0,$4,'Initial stock entry')`,
      [clubId, asset.id, operatorId, Number(total_quantity)]
    );
    await client.query('COMMIT');
    return asset;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getAsset(assetId: string, clubId: string): Promise<Record<string, unknown>> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT a.*, c.name AS category_name
     FROM assets a LEFT JOIN asset_categories c ON c.id = a.category_id
     WHERE a.id = $1 AND a.club_id = $2 AND a.is_active = true`,
    [assetId, clubId]
  );
  if (!rows.length) throw new AppError('Asset not found', 404);

  const { rows: loans } = await db.query<Record<string, unknown>>(
    `SELECT l.id, l.quantity, l.status, l.due_date,
            l.checked_out_at, l.returned_at, l.return_condition,
            u.name AS coach_name
     FROM loans l JOIN users u ON u.id = l.coach_id
     WHERE l.asset_id = $1 ORDER BY l.created_at DESC LIMIT 10`,
    [assetId]
  );
  return { ...rows[0], recent_loans: loans };
}

export async function updateAsset(
  assetId: string,
  clubId: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const {
    name, category_id, brand, model, size,
    purchase_date, purchase_price, useful_life_years,
    notes, low_stock_threshold, status,
  } = data;

  const validStatuses = ['available', 'on_loan', 'maintenance', 'retired'];
  if (status && !validStatuses.includes(String(status))) throw new AppError('Invalid status', 400);

  const { rows } = await db.query<Record<string, unknown>>(
    `UPDATE assets SET
       name                = COALESCE($1, name),
       category_id         = COALESCE($2, category_id),
       brand               = COALESCE($3, brand),
       model               = COALESCE($4, model),
       size                = COALESCE($5, size),
       purchase_date       = COALESCE($6, purchase_date),
       purchase_price      = COALESCE($7, purchase_price),
       useful_life_years   = COALESCE($8, useful_life_years),
       notes               = COALESCE($9, notes),
       low_stock_threshold = COALESCE($10, low_stock_threshold),
       status              = COALESCE($11::asset_status, status)
     WHERE id = $12 AND club_id = $13 AND is_active = true
     RETURNING *`,
    [
      name ?? null, category_id ?? null, brand ?? null, model ?? null, size ?? null,
      purchase_date ?? null,
      purchase_price != null ? parseFloat(String(purchase_price)) : null,
      useful_life_years != null ? parseInt(String(useful_life_years)) : null,
      notes ?? null,
      low_stock_threshold != null ? parseInt(String(low_stock_threshold)) : null,
      status ?? null,
      assetId, clubId,
    ]
  );
  if (!rows.length) throw new AppError('Asset not found', 404);
  return rows[0];
}

export async function deleteAsset(assetId: string, clubId: string): Promise<void> {
  const { rows } = await db.query<{ id: string }>(
    'UPDATE assets SET is_active = false WHERE id = $1 AND club_id = $2 RETURNING id',
    [assetId, clubId]
  );
  if (!rows.length) throw new AppError('Asset not found', 404);
}

export async function uploadImage(
  assetId: string,
  clubId: string,
  buffer: Buffer,
  mimetype: string,
  originalname: string
): Promise<Record<string, unknown>> {
  const ext = originalname.split('.').pop();
  const path = `assets/${clubId}/${assetId}_${Date.now()}.${ext}`;
  const url = await storage.uploadFile(buffer, path, mimetype);

  const { rows } = await db.query<Record<string, unknown>>(
    'UPDATE assets SET image_url = $1 WHERE id = $2 AND club_id = $3 RETURNING id, image_url',
    [url, assetId, clubId]
  );
  if (!rows.length) throw new AppError('Asset not found', 404);
  return rows[0];
}

export async function getDepreciation(assetId: string, clubId: string): Promise<Record<string, unknown>> {
  const { rows: check } = await db.query<{ id: string }>(
    'SELECT id FROM assets WHERE id = $1 AND club_id = $2 AND is_active = true',
    [assetId, clubId]
  );
  if (!check.length) throw new AppError('Asset not found', 404);

  const { rows } = await db.query<Record<string, unknown>>('SELECT * FROM get_asset_depreciation($1)', [assetId]);
  if (!rows.length) {
    throw new AppError('Asset is missing purchase_price, purchase_date, or useful_life_years', 422);
  }
  return rows[0];
}

export async function bulkImport(
  clubId: string,
  operatorId: string,
  fileBuffer: Buffer
): Promise<{ imported: number; errors: { row: number; message: string }[] }> {
  const records = parse(fileBuffer.toString('utf8'), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  const imported: Record<string, unknown>[] = [];
  const errors: { row: number; message: string }[] = [];
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');
    for (const [i, row] of records.entries()) {
      if (!row.name) {
        errors.push({ row: i + 2, message: 'name is required' });
        continue;
      }
      const qty = Math.max(1, parseInt(row.total_quantity) || 1);
      const { rows } = await client.query<Record<string, unknown>>(
        `INSERT INTO assets
           (club_id, name, total_quantity, available_quantity, status,
            brand, model, size, purchase_date, purchase_price, useful_life_years, notes)
         VALUES ($1,$2,$3,$3,'available',$4,$5,$6,$7,$8,$9,$10)
         RETURNING id, name`,
        [
          clubId, row.name, qty,
          row.brand || null, row.model || null, row.size || null,
          row.purchase_date || null,
          row.purchase_price ? parseFloat(row.purchase_price) : null,
          row.useful_life_years ? parseInt(row.useful_life_years) : null,
          row.notes || null,
        ]
      );
      const asset = rows[0];
      await client.query(
        `INSERT INTO stock_movements
           (club_id, asset_id, operator_id, type, quantity_delta, quantity_before, quantity_after, notes)
         VALUES ($1,$2,$3,'purchase',$4,0,$4,'Bulk import')`,
        [clubId, asset.id, operatorId, qty]
      );
      imported.push(asset);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { imported: imported.length, errors };
}
