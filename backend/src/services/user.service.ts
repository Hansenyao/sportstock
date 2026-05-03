import bcrypt from 'bcryptjs';
import { Resend } from 'resend';
import * as db from '../db';
import config from '../config';
import AppError from '../utils/AppError';
import type { PaginatedResult } from '../types';

const CLUB_ROLES = ['club_admin', 'asset_manager', 'coach'];

// TODO: restore random generation before production
function generateTempPassword(): string {
  return '123456';
}

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

  const { rows: teamRows } = await db.query<Record<string, unknown>>(
    `SELECT tm.team_id, tm.team_role, t.name AS team_name, t.gender, t.age_group
     FROM   team_members tm
     JOIN   teams t ON t.id = tm.team_id
     WHERE  tm.user_id = $1
     ORDER BY t.name ASC`,
    [userId]
  );

  return { ...rows[0], teams: teamRows };
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

export async function deactivateUser(
  targetId: string,
  clubId: string,
  requesterId: string
): Promise<void> {
  if (targetId === requesterId) throw new AppError('You cannot deactivate your own account', 400);
  const { rows } = await db.query<{ id: string }>(
    'UPDATE users SET is_active = false WHERE id = $1 AND club_id = $2 RETURNING id',
    [targetId, clubId]
  );
  if (!rows.length) throw new AppError('User not found', 404);
}

export async function createUser(
  clubId: string,
  { email, name, role = 'coach', phone }: {
    email: string;
    name: string;
    role?: string;
    phone?: string;
  }
): Promise<Record<string, unknown>> {
  if (!email) throw new AppError('email is required', 400);
  if (!name?.trim()) throw new AppError('name is required', 400);
  if (!CLUB_ROLES.includes(role)) throw new AppError('Invalid role', 400);

  const { rows: existing } = await db.query<{ id: string }>(
    'SELECT id FROM users WHERE email = $1',
    [email.toLowerCase()]
  );
  if (existing.length) throw new AppError('This email is already registered', 409);

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const { rows } = await db.query<Record<string, unknown>>(
    `INSERT INTO users (email, password_hash, name, phone, club_id, role, email_verified)
     VALUES ($1, $2, $3, $4, $5, $6, true)
     RETURNING id, email, name, phone, club_id, role, is_active, created_at`,
    [email.toLowerCase(), passwordHash, name.trim(), phone ?? null, clubId, role]
  );

  new Resend(config.resend.apiKey).emails.send({
    from: config.resend.fromEmail,
    to: email,
    subject: 'Welcome to SportStock',
    text: `Hi ${name},\n\nYour account has been created.\nEmail: ${email}\nTemporary password: ${tempPassword}\n\nPlease log in and change your password immediately.`,
  }).catch(() => {});

  return rows[0];
}
