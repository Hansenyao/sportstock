import { createClerkClient, verifyToken as clerkVerifyToken } from '@clerk/backend';
import * as db from '../db';
import config from '../config';
import type { AuthUser } from '../types';

const clerk = createClerkClient({ secretKey: config.clerk.secretKey });

export async function verifyToken(token: string): Promise<{ sub: string }> {
  const payload = await clerkVerifyToken(token, { secretKey: config.clerk.secretKey });
  return payload as unknown as { sub: string };
}

export async function getOrCreateUser(clerkId: string): Promise<AuthUser> {
  const { rows } = await db.query<AuthUser>(
    'SELECT id, club_id, clerk_id, name, email, role, is_active FROM users WHERE clerk_id = $1',
    [clerkId]
  );
  if (rows.length) return rows[0];

  const clerkUser = await clerk.users.getUser(clerkId);
  const email = clerkUser.emailAddresses[0]?.emailAddress ?? '';
  const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || email;

  const { rows: inviteRows } = await db.query<{ club_id: string; role: string }>(
    `SELECT club_id, role FROM user_invites
     WHERE email = $1 AND accepted_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [email]
  );
  const invite = inviteRows[0] ?? null;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<AuthUser>(
      `INSERT INTO users (clerk_id, name, email, club_id, role, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (clerk_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email
       RETURNING id, club_id, clerk_id, name, email, role, is_active`,
      [clerkId, name, email, invite?.club_id ?? null, invite?.role ?? 'coach']
    );
    if (invite) {
      await client.query(
        `UPDATE user_invites SET accepted_at = NOW()
         WHERE email = $1 AND club_id = $2 AND accepted_at IS NULL`,
        [email, invite.club_id]
      );
    }
    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getProfile(userId: string): Promise<Record<string, unknown> | null> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT u.id, u.club_id, u.name, u.email, u.phone, u.role, u.is_active, u.created_at,
            c.name AS club_name, c.logo_url AS club_logo
     FROM users u
     LEFT JOIN clubs c ON c.id = u.club_id
     WHERE u.id = $1`,
    [userId]
  );
  return rows[0] ?? null;
}
