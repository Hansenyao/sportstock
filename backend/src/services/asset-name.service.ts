import * as db from '../db';
import AppError from '../utils/AppError';

export async function listAssetNames(clubId: string): Promise<Record<string, unknown>[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT an.*,
            COUNT(at.id) FILTER (WHERE at.is_active = true) AS type_count
     FROM asset_names an
     LEFT JOIN asset_types at ON at.asset_name_id = an.id
     WHERE an.club_id = $1
     GROUP BY an.id
     ORDER BY an.name ASC`,
    [clubId]
  );
  return rows;
}

export async function createAssetName(
  clubId: string,
  name: string
): Promise<Record<string, unknown>> {
  if (!name?.trim()) throw new AppError('name is required', 400);
  try {
    const { rows } = await db.query<Record<string, unknown>>(
      'INSERT INTO asset_names (club_id, name) VALUES ($1, $2) RETURNING *',
      [clubId, name.trim()]
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
  name: string
): Promise<Record<string, unknown>> {
  if (!name?.trim()) throw new AppError('name is required', 400);
  try {
    const { rows } = await db.query<Record<string, unknown>>(
      'UPDATE asset_names SET name = $1 WHERE id = $2 AND club_id = $3 RETURNING *',
      [name.trim(), id, clubId]
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
