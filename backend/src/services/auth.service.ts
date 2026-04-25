import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Resend } from 'resend';
import * as db from '../db';
import config from '../config';
import AppError from '../utils/AppError';
import type { AuthUser } from '../types';

const SALT_ROUNDS = 10;
const CODE_EXPIRY_MINUTES = 15;

// TODO: restore real code generation before production
function generateCode(): string {
  return '123456';
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  } as jwt.SignOptions);
}

export function verifyToken(token: string): { sub: string } {
  return jwt.verify(token, config.jwt.secret) as { sub: string };
}

export async function getUserById(userId: string): Promise<AuthUser> {
  const { rows } = await db.query<AuthUser>(
    'SELECT id, club_id, name, email, role, is_active FROM users WHERE id = $1',
    [userId]
  );
  if (!rows.length) throw new AppError('User not found', 401);
  return rows[0];
}

export async function register(data: {
  club: { name: string; sport_type?: string; address?: string; contact_email: string };
  user: { name: string; email: string; password: string; phone?: string };
}): Promise<void> {
  const { club, user } = data;

  if (!club.name?.trim()) throw new AppError('Club name is required', 400);
  if (!club.sport_type?.trim()) throw new AppError('Sport type is required', 400);
  if (!club.contact_email) throw new AppError('Club contact email is required', 400);
  if (!user.name?.trim()) throw new AppError('User name is required', 400);
  if (!user.email) throw new AppError('Email is required', 400);
  if (!user.password || user.password.length < 6)
    throw new AppError('Password must be at least 6 characters', 400);

  const { rows: emailCheck } = await db.query<{ id: string }>(
    'SELECT id FROM users WHERE email = $1',
    [user.email.toLowerCase()]
  );
  if (emailCheck.length) throw new AppError('This email is already registered', 409);

  const { rows: clubCheck } = await db.query<{ id: string }>(
    'SELECT id FROM clubs WHERE LOWER(name) = LOWER($1)',
    [club.name.trim()]
  );
  if (clubCheck.length) throw new AppError('A club with this name already exists', 409);

  const passwordHash = await bcrypt.hash(user.password, SALT_ROUNDS);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Create club first so we have a club_id for the user (DB constraint requires it)
    const { rows: clubRows } = await client.query<{ id: string }>(
      `INSERT INTO clubs (name, sport_type, address, contact_email)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [club.name.trim(), club.sport_type ?? null, club.address ?? null, club.contact_email]
    );
    const clubId = clubRows[0].id;

    await client.query(
      `INSERT INTO users (email, password_hash, name, phone, role, email_verified, club_id)
       VALUES ($1, $2, $3, $4, 'club_admin', false, $5)`,
      [user.email.toLowerCase(), passwordHash, user.name.trim(), user.phone ?? null, clubId]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await sendVerificationCode(user.email.toLowerCase(), 'registration');
}

export async function sendVerificationCode(
  email: string,
  type: 'registration' | 'password_reset'
): Promise<void> {
  const code = generateCode();
  await db.query(
    `INSERT INTO email_verifications (email, code, type, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '${CODE_EXPIRY_MINUTES} minutes')`,
    [email.toLowerCase(), code, type]
  );

  // TODO: uncomment before production
  // const isReg = type === 'registration';
  // await new Resend(config.resend.apiKey).emails.send({
  //   from: config.resend.fromEmail,
  //   to: email,
  //   subject: isReg ? 'Verify your SportStock email' : 'SportStock password reset code',
  //   text: isReg
  //     ? `Your verification code is: ${code}\nThis code expires in ${CODE_EXPIRY_MINUTES} minutes.`
  //     : `Your password reset code is: ${code}\nThis code expires in ${CODE_EXPIRY_MINUTES} minutes.`,
  // });
}

export async function verifyEmail(email: string, code: string): Promise<void> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM email_verifications
     WHERE email = $1 AND code = $2 AND type = 'registration'
       AND expires_at > NOW() AND used_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [email.toLowerCase(), code]
  );
  if (!rows.length) throw new AppError('Invalid or expired verification code', 400);

  await db.query('UPDATE email_verifications SET used_at = NOW() WHERE id = $1', [rows[0].id]);
  await db.query('UPDATE users SET email_verified = true WHERE email = $1', [email.toLowerCase()]);
}

export async function login(
  email: string,
  password: string
): Promise<{ token: string; user: Record<string, unknown> }> {
  const { rows } = await db.query<
    AuthUser & { password_hash: string; email_verified: boolean; club_name: string | null }
  >(
    `SELECT u.id, u.club_id, u.name, u.email, u.role, u.is_active,
            u.password_hash, u.email_verified, c.name AS club_name
     FROM users u
     LEFT JOIN clubs c ON c.id = u.club_id
     WHERE u.email = $1`,
    [email.toLowerCase()]
  );

  if (!rows.length) throw new AppError('Invalid email or password', 401);
  const user = rows[0];

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new AppError('Invalid email or password', 401);

  if (!user.email_verified) throw new AppError('Please verify your email before logging in', 403);
  if (!user.is_active) throw new AppError('Account is deactivated', 403);

  const token = signToken(user.id);
  return {
    token,
    user: {
      id: user.id,
      club_id: user.club_id,
      name: user.name,
      email: user.email,
      role: user.role,
      club_name: user.club_name ?? null,
    },
  };
}

export async function forgotPassword(email: string): Promise<void> {
  const { rows } = await db.query<{ id: string }>(
    'SELECT id FROM users WHERE email = $1 AND email_verified = true AND is_active = true',
    [email.toLowerCase()]
  );
  if (!rows.length) return; // Silent — never reveal whether email exists

  await sendVerificationCode(email.toLowerCase(), 'password_reset');
}

export async function resetPassword(
  email: string,
  code: string,
  newPassword: string
): Promise<void> {
  if (!newPassword || newPassword.length < 6)
    throw new AppError('Password must be at least 6 characters', 400);

  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM email_verifications
     WHERE email = $1 AND code = $2 AND type = 'password_reset'
       AND expires_at > NOW() AND used_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [email.toLowerCase(), code]
  );
  if (!rows.length) throw new AppError('Invalid or expired reset code', 400);

  await db.query('UPDATE email_verifications SET used_at = NOW() WHERE id = $1', [rows[0].id]);
  const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await db.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hash, email.toLowerCase()]);
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  if (!newPassword || newPassword.length < 6)
    throw new AppError('New password must be at least 6 characters', 400);

  const { rows } = await db.query<{ password_hash: string }>(
    'SELECT password_hash FROM users WHERE id = $1',
    [userId]
  );
  if (!rows.length) throw new AppError('User not found', 404);

  const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!valid) throw new AppError('Current password is incorrect', 400);

  const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
}

export async function getProfile(userId: string): Promise<Record<string, unknown> | null> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT u.id, u.club_id, u.name, u.email, u.phone, u.role, u.is_active,
            u.email_verified, u.created_at,
            c.name AS club_name, c.logo_url AS club_logo
     FROM users u
     LEFT JOIN clubs c ON c.id = u.club_id
     WHERE u.id = $1`,
    [userId]
  );
  return rows[0] ?? null;
}
