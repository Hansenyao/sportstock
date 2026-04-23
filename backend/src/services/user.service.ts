import * as db from '../db';
import AppError from '../utils/AppError';
import type { PaginatedResult } from '../types';

const CLUB_ROLES = ['club_admin', 'asset_manager', 'coach'];

export async function listUsers(
  clubId: string,
  { role, is_active, page = 1, limit = 20 }: {
    role?: string;
    is_active?: string;
    page?: number | string;
    limit?: number | string;
  }
): Promise<PaginatedResult<Record<string, unknown>>> {
  const offset = (Number(page) - 1) * Number(limit);
  const conditions = ['club_id = $1'];
  const params: unknown[] = [clubId];

  if (role) conditions.push(`role = $${params.push(role)}`);
  if (is_active !== undefined) conditions.push(`is_active = $${params.push(is_active === 'true')}`);

  const where = conditions.join(' AND ');
  const [{ rows }, { rows: countRows }] = await Promise.all([
    db.query<Record<string, unknown>>(
      `SELECT id, name, email, phone, role, is_active, created_at
       FROM users WHERE ${where} ORDER BY name ASC
       LIMIT $${params.push(Number(limit))} OFFSET $${params.push(offset)}`,
      params
    ),
    db.query<{ count: string }>(`SELECT COUNT(*) FROM users WHERE ${where}`, params.slice(0, -2)),
  ]);
  return { data: rows, total: parseInt(countRows[0].count), page: Number(page), limit: Number(limit) };
}

export async function getUser(userId: string, clubId: string): Promise<Record<string, unknown>> {
  const { rows } = await db.query<Record<string, unknown>>(
    'SELECT id, name, email, phone, role, is_active, created_at FROM users WHERE id = $1 AND club_id = $2',
    [userId, clubId]
  );
  if (!rows.length) throw new AppError('User not found', 404);
  return rows[0];
}

export async function updateUser(
  targetId: string,
  clubId: string,
  { name, phone, role }: { name?: string; phone?: string; role?: string }
): Promise<Record<string, unknown>> {
  if (role && !CLUB_ROLES.includes(role)) throw new AppError('Invalid role', 400);

  if (role && role !== 'club_admin') {
    const { rows } = await db.query<{ count: string }>(
      `SELECT COUNT(*) FROM users
       WHERE club_id = $1 AND role = 'club_admin' AND is_active = true AND id != $2`,
      [clubId, targetId]
    );
    if (parseInt(rows[0].count) === 0) {
      throw new AppError('Cannot demote the last club admin', 409);
    }
  }

  const { rows } = await db.query<Record<string, unknown>>(
    `UPDATE users SET
       name  = COALESCE($1, name),
       phone = COALESCE($2, phone),
       role  = COALESCE($3::user_role, role)
     WHERE id = $4 AND club_id = $5
     RETURNING id, name, email, phone, role, is_active`,
    [name ?? null, phone ?? null, role ?? null, targetId, clubId]
  );
  if (!rows.length) throw new AppError('User not found', 404);
  return rows[0];
}

export async function deactivateUser(targetId: string, clubId: string, requesterId: string): Promise<void> {
  if (targetId === requesterId) throw new AppError('You cannot deactivate your own account', 400);
  const { rows } = await db.query<{ id: string }>(
    'UPDATE users SET is_active = false WHERE id = $1 AND club_id = $2 RETURNING id',
    [targetId, clubId]
  );
  if (!rows.length) throw new AppError('User not found', 404);
}

export async function inviteUser(
  clubId: string,
  inviterId: string,
  email: string,
  role = 'coach'
): Promise<Record<string, unknown>> {
  if (!email) throw new AppError('email is required', 400);
  if (!CLUB_ROLES.includes(role)) throw new AppError('Invalid role', 400);

  const { rows: existing } = await db.query<{ id: string }>(
    'SELECT id FROM users WHERE email = $1 AND club_id = $2',
    [email, clubId]
  );
  if (existing.length) throw new AppError('This email is already a member of your club', 409);

  const { rows } = await db.query<Record<string, unknown>>(
    `INSERT INTO user_invites (club_id, invited_by, email, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT ON CONSTRAINT uq_user_invites_pending
       DO UPDATE SET role = EXCLUDED.role, expires_at = NOW() + INTERVAL '7 days'
     RETURNING *`,
    [clubId, inviterId, email, role]
  );
  return rows[0];
}

export async function listInvites(clubId: string): Promise<Record<string, unknown>[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT ui.*, u.name AS invited_by_name
     FROM user_invites ui
     JOIN users u ON u.id = ui.invited_by
     WHERE ui.club_id = $1 AND ui.accepted_at IS NULL AND ui.expires_at > NOW()
     ORDER BY ui.created_at DESC`,
    [clubId]
  );
  return rows;
}
