import * as db from '../db';
import * as storage from './storage';
import AppError from '../utils/AppError';
import type { PaginatedResult } from '../types';

// ── Categories (unchanged) ────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_SELECT = `
  SELECT
    at.id,
    at.club_id,
    at.asset_name_id,
    an.name,
    at.category_id,
    c.name                                        AS category_name,
    at.brand,
    at.model,
    at.size,
    at.image_url,
    at.low_stock_threshold,
    at.is_active,
    at.created_at,
    at.updated_at,
    COALESCE(SUM(ab.total_quantity), 0)           AS total_quantity,
    COALESCE(SUM(ab.available_quantity), 0)       AS available_quantity,
    COUNT(ab.id)                                  AS batch_count,
    CASE
      WHEN COUNT(ab.id) = 0                              THEN 'retired'
      WHEN COALESCE(SUM(ab.total_quantity), 0) = 0       THEN 'retired'
      WHEN COALESCE(SUM(ab.available_quantity), 0) = 0   THEN 'on_loan'
      ELSE 'available'
    END                                           AS status,
    COALESCE(
      JSON_AGG(
        JSON_BUILD_OBJECT(
          'id',                ab.id,
          'purchase_date',     ab.purchase_date,
          'purchase_price',    ab.purchase_price,
          'useful_life_years', ab.useful_life_years,
          'total_quantity',    ab.total_quantity,
          'available_quantity',ab.available_quantity,
          'status',            ab.status,
          'notes',             ab.notes,
          'created_at',        ab.created_at
        ) ORDER BY ab.purchase_date ASC NULLS LAST, ab.created_at ASC
      ) FILTER (WHERE ab.id IS NOT NULL),
      '[]'
    )                                             AS batches
  FROM  asset_types at
  JOIN  asset_names       an ON an.id = at.asset_name_id
  LEFT JOIN asset_categories c  ON c.id  = at.category_id
  LEFT JOIN asset_batches    ab ON ab.asset_type_id = at.id
`;

// ── List asset types ──────────────────────────────────────────────────────────

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
  const conditions = ['at.club_id = $1', 'at.is_active = true'];
  const params: unknown[] = [clubId];

  if (category_id) conditions.push(`at.category_id = $${params.push(category_id)}`);
  if (search)      conditions.push(`an.name ILIKE $${params.push('%' + search + '%')}`);

  const where = conditions.join(' AND ');

  // status is a computed column — must filter in HAVING
  const having = status
    ? `HAVING CASE
         WHEN COUNT(ab.id) = 0 OR COALESCE(SUM(ab.total_quantity),0) = 0 THEN 'retired'
         WHEN COALESCE(SUM(ab.available_quantity),0) = 0 THEN 'on_loan'
         ELSE 'available'
       END = $${params.push(status)}`
    : '';

  const [{ rows }, { rows: countRows }] = await Promise.all([
    db.query<Record<string, unknown>>(
      `${TYPE_SELECT}
       WHERE ${where}
       GROUP BY at.id, an.name, c.name
       ${having}
       ORDER BY an.name ASC, at.brand ASC NULLS LAST
       LIMIT $${params.push(Number(limit))} OFFSET $${params.push(offset)}`,
      params
    ),
    db.query<{ count: string }>(
      `SELECT COUNT(*) FROM (
         SELECT at.id
         FROM asset_types at
         JOIN asset_names an ON an.id = at.asset_name_id
         LEFT JOIN asset_batches ab ON ab.asset_type_id = at.id
         WHERE ${where}
         GROUP BY at.id
         ${having}
       ) sub`,
      params.slice(0, -2)  // strip limit and offset; status (if any) stays for HAVING
    ),
  ]);

  return { data: rows, total: parseInt(countRows[0].count), page: Number(page), limit: Number(limit) };
}

// ── Get single asset type ─────────────────────────────────────────────────────

export async function getAsset(typeId: string, clubId: string): Promise<Record<string, unknown>> {
  const { rows } = await db.query<Record<string, unknown>>(
    `${TYPE_SELECT}
     WHERE at.id = $1 AND at.club_id = $2 AND at.is_active = true
     GROUP BY at.id, an.name, c.name`,
    [typeId, clubId]
  );
  if (!rows.length) throw new AppError('Asset not found', 404);
  return rows[0];
}

// ── Create asset type + first batch ──────────────────────────────────────────

export async function createAsset(
  clubId: string,
  operatorId: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const {
    asset_name_id,
    category_id,
    brand, model, size,
    total_quantity = 1,
    purchase_date, purchase_price, useful_life_years,
    notes,
    low_stock_threshold,
  } = data;

  if (!asset_name_id) throw new AppError('asset_name_id is required', 400);
  if (Number(total_quantity) < 1) throw new AppError('total_quantity must be at least 1', 400);

  // Verify asset_name belongs to this club
  const { rows: nameRows } = await db.query<{ id: string }>(
    'SELECT id FROM asset_names WHERE id = $1 AND club_id = $2',
    [asset_name_id, clubId]
  );
  if (!nameRows.length) throw new AppError('Asset name not found in this club', 404);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Find or create asset_type (unique by club + name + brand + model + size)
    let typeId: string;
    const { rows: existing } = await client.query<{ id: string }>(
      `SELECT id FROM asset_types
       WHERE club_id = $1 AND asset_name_id = $2
         AND COALESCE(brand,'') = COALESCE($3,'')
         AND COALESCE(model,'') = COALESCE($4,'')
         AND COALESCE(size, '') = COALESCE($5,'')
         AND is_active = true`,
      [clubId, asset_name_id, brand ?? null, model ?? null, size ?? null]
    );

    if (existing.length) {
      typeId = existing[0].id;
      // Update category / low_stock_threshold if provided
      if (category_id !== undefined || low_stock_threshold !== undefined) {
        await client.query(
          `UPDATE asset_types SET
             category_id         = COALESCE($1, category_id),
             low_stock_threshold = COALESCE($2, low_stock_threshold),
             updated_at          = NOW()
           WHERE id = $3`,
          [category_id ?? null, low_stock_threshold ?? null, typeId]
        );
      }
    } else {
      const { rows: typeRows } = await client.query<{ id: string }>(
        `INSERT INTO asset_types
           (club_id, asset_name_id, category_id, brand, model, size, low_stock_threshold)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [
          clubId, asset_name_id, category_id ?? null,
          brand ?? null, model ?? null, size ?? null,
          low_stock_threshold ?? null,
        ]
      );
      typeId = typeRows[0].id;
    }

    // Insert batch
    const qty = Number(total_quantity);
    const { rows: batchRows } = await client.query<{ id: string }>(
      `INSERT INTO asset_batches
         (asset_type_id, purchase_date, purchase_price, useful_life_years,
          total_quantity, available_quantity, status, notes)
       VALUES ($1,$2,$3,$4,$5,$5,'available',$6) RETURNING id`,
      [
        typeId,
        purchase_date ?? null,
        purchase_price != null ? parseFloat(String(purchase_price)) : null,
        useful_life_years != null ? parseInt(String(useful_life_years)) : null,
        qty,
        notes ?? null,
      ]
    );
    const batchId = batchRows[0].id;

    await client.query(
      `INSERT INTO stock_movements
         (club_id, asset_batch_id, operator_id, type,
          quantity_delta, quantity_before, quantity_after, notes)
       VALUES ($1,$2,$3,'purchase',$4,0,$4,'Initial stock entry')`,
      [clubId, batchId, operatorId, qty]
    );

    await client.query('COMMIT');
    return getAsset(typeId, clubId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Update asset type (type-level fields only) ────────────────────────────────

export async function updateAsset(
  typeId: string,
  clubId: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { asset_name_id, category_id, brand, model, size, low_stock_threshold } = data;

  // Validate asset_name_id if changing
  if (asset_name_id) {
    const { rows } = await db.query<{ id: string }>(
      'SELECT id FROM asset_names WHERE id = $1 AND club_id = $2',
      [asset_name_id, clubId]
    );
    if (!rows.length) throw new AppError('Asset name not found in this club', 404);
  }

  const setClauses: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];

  if (asset_name_id    !== undefined) setClauses.push(`asset_name_id       = $${params.push(asset_name_id)}`);
  if (category_id      !== undefined) setClauses.push(`category_id         = $${params.push(category_id ?? null)}`);
  if (brand            !== undefined) setClauses.push(`brand               = $${params.push(brand ?? null)}`);
  if (model            !== undefined) setClauses.push(`model               = $${params.push(model ?? null)}`);
  if (size             !== undefined) setClauses.push(`size                = $${params.push(size ?? null)}`);
  if (low_stock_threshold !== undefined) setClauses.push(`low_stock_threshold = $${params.push(low_stock_threshold ?? null)}`);

  params.push(typeId, clubId);

  const { rows } = await db.query<Record<string, unknown>>(
    `UPDATE asset_types SET ${setClauses.join(', ')}
     WHERE id = $${params.length - 1} AND club_id = $${params.length} AND is_active = true
     RETURNING id`,
    params
  );
  if (!rows.length) throw new AppError('Asset not found', 404);
  return getAsset(typeId, clubId);
}

// ── Add new batch to existing asset type ─────────────────────────────────────

export async function addBatch(
  typeId: string,
  clubId: string,
  operatorId: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { total_quantity = 1, purchase_date, purchase_price, useful_life_years, notes } = data;
  if (Number(total_quantity) < 1) throw new AppError('total_quantity must be at least 1', 400);

  // Verify type belongs to club
  const { rows: typeRows } = await db.query<{ id: string }>(
    'SELECT id FROM asset_types WHERE id = $1 AND club_id = $2 AND is_active = true',
    [typeId, clubId]
  );
  if (!typeRows.length) throw new AppError('Asset not found', 404);

  const qty = Number(total_quantity);
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: batchRows } = await client.query<{ id: string }>(
      `INSERT INTO asset_batches
         (asset_type_id, purchase_date, purchase_price, useful_life_years,
          total_quantity, available_quantity, status, notes)
       VALUES ($1,$2,$3,$4,$5,$5,'available',$6) RETURNING id`,
      [
        typeId,
        purchase_date ?? null,
        purchase_price != null ? parseFloat(String(purchase_price)) : null,
        useful_life_years != null ? parseInt(String(useful_life_years)) : null,
        qty,
        notes ?? null,
      ]
    );

    await client.query(
      `INSERT INTO stock_movements
         (club_id, asset_batch_id, operator_id, type,
          quantity_delta, quantity_before, quantity_after, notes)
       VALUES ($1,$2,$3,'purchase',$4,0,$4,'New batch purchased')`,
      [clubId, batchRows[0].id, operatorId, qty]
    );

    await client.query('COMMIT');
    return getAsset(typeId, clubId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Update batch purchase details ─────────────────────────────────────────────

export async function updateBatch(
  batchId: string,
  typeId: string,
  clubId: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  // Verify batch belongs to this type and club
  const { rows: check } = await db.query<{ id: string }>(
    `SELECT ab.id FROM asset_batches ab
     JOIN asset_types at ON at.id = ab.asset_type_id
     WHERE ab.id = $1 AND ab.asset_type_id = $2 AND at.club_id = $3`,
    [batchId, typeId, clubId]
  );
  if (!check.length) throw new AppError('Batch not found', 404);

  const { purchase_date, purchase_price, useful_life_years, notes, status } = data;
  const setClauses: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];

  if (purchase_date      !== undefined) setClauses.push(`purchase_date      = $${params.push(purchase_date ?? null)}`);
  if (purchase_price     !== undefined) setClauses.push(`purchase_price     = $${params.push(purchase_price != null ? parseFloat(String(purchase_price)) : null)}`);
  if (useful_life_years  !== undefined) setClauses.push(`useful_life_years  = $${params.push(useful_life_years != null ? parseInt(String(useful_life_years)) : null)}`);
  if (notes              !== undefined) setClauses.push(`notes              = $${params.push(notes ?? null)}`);
  if (status             !== undefined) setClauses.push(`status             = $${params.push(status)}::asset_status`);

  params.push(batchId);
  await db.query(
    `UPDATE asset_batches SET ${setClauses.join(', ')} WHERE id = $${params.length}`,
    params
  );
  return getAsset(typeId, clubId);
}

// ── Soft-delete asset type ────────────────────────────────────────────────────

export async function deleteAsset(typeId: string, clubId: string): Promise<void> {
  // Block if any active loan_items exist
  const { rows } = await db.query<{ count: string }>(
    `SELECT COUNT(*) FROM loan_items li
     JOIN loans l ON l.id = li.loan_id
     WHERE li.asset_type_id = $1 AND l.status NOT IN ('returned','rejected')`,
    [typeId]
  );
  if (parseInt(rows[0].count) > 0) {
    throw new AppError('Cannot delete: asset has active or pending loans', 409);
  }

  const result = await db.query(
    'UPDATE asset_types SET is_active = false, updated_at = NOW() WHERE id = $1 AND club_id = $2 RETURNING id',
    [typeId, clubId]
  );
  if (!result.rows.length) throw new AppError('Asset not found', 404);
}

// ── Upload image (on asset_type) ──────────────────────────────────────────────

export async function uploadImage(
  typeId: string,
  clubId: string,
  buffer: Buffer,
  mimetype: string,
  originalname: string
): Promise<Record<string, unknown>> {
  const ext = originalname.split('.').pop();
  const path = `assets/${clubId}/${typeId}_${Date.now()}.${ext}`;
  const url = await storage.uploadFile(buffer, path, mimetype);

  const { rows } = await db.query<Record<string, unknown>>(
    'UPDATE asset_types SET image_url = $1, updated_at = NOW() WHERE id = $2 AND club_id = $3 RETURNING id, image_url',
    [url, typeId, clubId]
  );
  if (!rows.length) throw new AppError('Asset not found', 404);
  return rows[0];
}

// ── Depreciation (per batch) ──────────────────────────────────────────────────

export async function getDepreciation(batchId: string, clubId: string): Promise<Record<string, unknown>> {
  // Verify batch belongs to this club
  const { rows: check } = await db.query<{ id: string }>(
    `SELECT ab.id FROM asset_batches ab
     JOIN asset_types at ON at.id = ab.asset_type_id
     WHERE ab.id = $1 AND at.club_id = $2`,
    [batchId, clubId]
  );
  if (!check.length) throw new AppError('Batch not found', 404);

  const { rows } = await db.query<Record<string, unknown>>(
    'SELECT * FROM get_asset_depreciation($1)',
    [batchId]
  );
  if (!rows.length) {
    throw new AppError('Batch is missing purchase_price, purchase_date, or useful_life_years', 422);
  }
  return rows[0];
}
