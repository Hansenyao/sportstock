import * as db from '../db';
import * as fcm from './fcm';
import AppError from '../utils/AppError';
import type { NotificationType, PaginatedResult } from '../types';

export async function notifyUser(
  clubId: string,
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  data: Record<string, unknown> = {}
): Promise<void> {
  await db.query(
    `INSERT INTO notifications (club_id, user_id, type, title, body, data)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [clubId, userId, type, title, body, JSON.stringify(data)]
  );
  fcm.sendToUser(userId, { title, body }, data).catch(() => {});
}

export async function notifyClubRoles(
  clubId: string,
  roles: string[],
  type: NotificationType,
  title: string,
  body: string,
  data: Record<string, unknown> = {}
): Promise<void> {
  await db.query(
    `INSERT INTO notifications (club_id, user_id, type, title, body, data)
     SELECT $1, u.id, $2, $3, $4, $5::jsonb
     FROM users u
     WHERE u.club_id = $1 AND u.role = ANY($6) AND u.is_active = true`,
    [clubId, type, title, body, JSON.stringify(data), roles]
  );
  fcm.sendToClub(clubId, roles, { title, body }, data).catch(() => {});
}

export async function listNotifications(
  userId: string,
  { is_read, page = 1, limit = 20 }: {
    is_read?: string | boolean;
    page?: number | string;
    limit?: number | string;
  }
): Promise<PaginatedResult<Record<string, unknown>>> {
  const offset = (Number(page) - 1) * Number(limit);
  const conditions = ['user_id = $1'];
  const params: unknown[] = [userId];

  if (is_read !== undefined) conditions.push(`is_read = $${params.push(is_read === 'true' || is_read === true)}`);

  const where = conditions.join(' AND ');
  const [{ rows }, { rows: countRows }] = await Promise.all([
    db.query<Record<string, unknown>>(
      `SELECT * FROM notifications WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${params.push(Number(limit))} OFFSET $${params.push(offset)}`,
      params
    ),
    db.query<{ count: string }>(`SELECT COUNT(*) FROM notifications WHERE ${where}`, params.slice(0, -2)),
  ]);

  return { data: rows, total: parseInt(countRows[0].count), page: Number(page), limit: Number(limit) };
}

export async function markRead(notificationId: string, userId: string): Promise<Record<string, unknown>> {
  const { rows } = await db.query<Record<string, unknown>>(
    'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *',
    [notificationId, userId]
  );
  if (!rows.length) throw new AppError('Notification not found', 404);
  return rows[0];
}

export async function markAllRead(userId: string): Promise<{ updated: number | null }> {
  const { rowCount } = await db.query(
    'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
    [userId]
  );
  return { updated: rowCount };
}

export async function registerToken(
  userId: string,
  token: string,
  deviceInfo?: unknown
): Promise<void> {
  if (!token) throw new AppError('token is required', 400);
  await db.query(
    `INSERT INTO fcm_tokens (user_id, token, device_info)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, token) DO UPDATE SET updated_at = NOW()`,
    [userId, token, deviceInfo ? JSON.stringify(deviceInfo) : null]
  );
}

export async function unregisterToken(userId: string, token: string): Promise<void> {
  if (!token) throw new AppError('token is required', 400);
  await db.query('DELETE FROM fcm_tokens WHERE user_id = $1 AND token = $2', [userId, token]);
}
