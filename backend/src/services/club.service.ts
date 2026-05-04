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
  {
    name,
    sport_type,
    address,
    contact_email,
    low_stock_threshold,
    retirement_alert_mode,
    retirement_alert_value,
  }: {
    name?: string;
    sport_type?: string;
    address?: string;
    contact_email?: string;
    low_stock_threshold?: unknown;
    retirement_alert_mode?: unknown;
    retirement_alert_value?: unknown;
  }
): Promise<Record<string, unknown>> {
  if (
    retirement_alert_mode !== undefined &&
    retirement_alert_mode !== null &&
    !['months', 'percent'].includes(String(retirement_alert_mode))
  ) {
    throw new AppError('retirement_alert_mode must be "months" or "percent"', 422);
  }

  const { rows } = await db.query<Record<string, unknown>>(
    `UPDATE clubs SET
       name                   = COALESCE($1, name),
       sport_type             = COALESCE($2, sport_type),
       address                = COALESCE($3, address),
       contact_email          = COALESCE($4, contact_email),
       low_stock_threshold    = COALESCE($5, low_stock_threshold),
       retirement_alert_mode  = COALESCE($6, retirement_alert_mode),
       retirement_alert_value = COALESCE($7, retirement_alert_value)
     WHERE id = $8 RETURNING *`,
    [
      name ?? null,
      sport_type ?? null,
      address ?? null,
      contact_email ?? null,
      low_stock_threshold != null ? parseInt(String(low_stock_threshold)) : null,
      retirement_alert_mode != null ? String(retirement_alert_mode) : null,
      retirement_alert_value != null ? parseInt(String(retirement_alert_value)) : null,
      clubId,
    ]
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
