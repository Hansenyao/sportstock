import * as db from '../db';
import AppError from '../utils/AppError';

export async function listAssetNames(clubId: string): Promise<Record<string, unknown>[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT an.*, c.name AS category_name,
            COUNT(at.id) FILTER (WHERE at.is_active = true) AS type_count
     FROM asset_names an
     LEFT JOIN asset_categories c ON c.id = an.category_id
     LEFT JOIN asset_types at ON at.asset_name_id = an.id
     WHERE an.club_id = $1
     GROUP BY an.id, c.name
     ORDER BY an.name ASC`,
    [clubId]
  );
  return rows;
}

export async function createAssetName(
  clubId: string,
  name: string,
  categoryId?: string | null
): Promise<Record<string, unknown>> {
  if (!name?.trim()) throw new AppError('name is required', 400);
  try {
    const { rows } = await db.query<Record<string, unknown>>(
      'INSERT INTO asset_names (club_id, name, category_id) VALUES ($1, $2, $3) RETURNING *',
      [clubId, name.trim(), categoryId ?? null]
    );
    return rows[0];
  } catch (err) {
    const anyErr = err as Record<string, unknown>;
    if (anyErr.code === '23505') throw new AppError('Asset name already exists', 409);
    throw err;
  }
}

export async function updateAssetName(
  id: string,
  clubId: string,
  name: string,
  categoryId?: string | null
): Promise<Record<string, unknown>> {
  if (!name?.trim()) throw new AppError('name is required', 400);
  try {
    const { rows } = await db.query<Record<string, unknown>>(
      `UPDATE asset_names
       SET name = $1, category_id = $2
       WHERE id = $3 AND club_id = $4 RETURNING *`,
      [name.trim(), categoryId ?? null, id, clubId]
    );
    if (!rows.length) throw new AppError('Asset name not found', 404);
    return rows[0];
  } catch (err) {
    const anyErr = err as Record<string, unknown>;
    if (anyErr.code === '23505') throw new AppError('Asset name already exists', 409);
    throw err;
  }
}

export async function deleteAssetName(id: string, clubId: string): Promise<void> {
  const { rows } = await db.query<{ count: string }>(
    'SELECT COUNT(*) FROM asset_types WHERE asset_name_id = $1 AND is_active = true',
    [id]
  );
  if (parseInt(rows[0].count) > 0) {
    throw new AppError('Cannot delete: active asset types are using this name', 409);
  }
  const result = await db.query(
    'DELETE FROM asset_names WHERE id = $1 AND club_id = $2',
    [id, clubId]
  );
  if (!result.rowCount) throw new AppError('Asset name not found', 404);
}
