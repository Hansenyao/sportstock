import * as db from '../db';
import * as storage from './storage';
import AppError from '../utils/AppError';

export async function getClub(clubId: string): Promise<Record<string, unknown>> {
  const { rows } = await db.query<Record<string, unknown>>('SELECT * FROM clubs WHERE id = $1', [clubId]);
  if (!rows.length) throw new AppError('Club not found', 404);
  return rows[0];
}

export async function updateClub(
  clubId: string,
  { name, sport_type, address, contact_email, low_stock_threshold }: {
    name?: string;
    sport_type?: string;
    address?: string;
    contact_email?: string;
    low_stock_threshold?: unknown;
  }
): Promise<Record<string, unknown>> {
  const { rows } = await db.query<Record<string, unknown>>(
    `UPDATE clubs SET
       name                = COALESCE($1, name),
       sport_type          = COALESCE($2, sport_type),
       address             = COALESCE($3, address),
       contact_email       = COALESCE($4, contact_email),
       low_stock_threshold = COALESCE($5, low_stock_threshold)
     WHERE id = $6 RETURNING *`,
    [name ?? null, sport_type ?? null, address ?? null, contact_email ?? null,
     low_stock_threshold != null ? parseInt(String(low_stock_threshold)) : null, clubId]
  );
  return rows[0];
}

export async function updateLogo(
  clubId: string,
  buffer: Buffer,
  mimetype: string,
  originalname: string
): Promise<{ logo_url: string }> {
  const ext = originalname.split('.').pop();
  const path = `clubs/${clubId}/logo_${Date.now()}.${ext}`;
  const url = await storage.uploadFile(buffer, path, mimetype);
  await db.query('UPDATE clubs SET logo_url = $1 WHERE id = $2', [url, clubId]);
  return { logo_url: url };
}
