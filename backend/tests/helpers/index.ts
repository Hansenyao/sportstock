import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, pool } from '../../src/db';

const JWT_SECRET = process.env.JWT_SECRET ?? 'sportstock-jwt-secret-change-in-production';

// Test password used when creating test users via the helpers
export const TEST_PASSWORD = 'TestPass@123';
// Bcrypt hash computed once at module load (rounds=1 for speed)
const TEST_PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 1);

export function authHeader(userId: string): Record<string, string> {
  const token = jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '1h' });
  return { Authorization: `Bearer ${token}` };
}

export async function createClub(name: string): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO clubs (name, sport_type, contact_email) VALUES ($1, 'Testing', $2) RETURNING id`,
    [name, `${name.replace(/\s+/g, '').toLowerCase()}@test.com`]
  );
  return rows[0].id;
}

export interface TestUser {
  id: string;
  club_id: string | null;
  email: string;
  role: string;
}

export async function createUser(
  email: string,
  clubId: string | null,
  role: string
): Promise<TestUser> {
  const { rows } = await query<TestUser>(
    `INSERT INTO users (email, password_hash, name, club_id, role, email_verified)
     VALUES ($1, $2, $3, $4, $5, true)
     ON CONFLICT (email) DO UPDATE
       SET club_id = EXCLUDED.club_id,
           role    = EXCLUDED.role
     RETURNING id, club_id, email, role`,
    [email, TEST_PASSWORD_HASH, `Test ${role}`, clubId, role]
  );
  return rows[0];
}

export async function createAsset(
  clubId: string,
  operatorId: string,
  name: string,
  quantity = 5
): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO assets (club_id, name, total_quantity, available_quantity, status)
       VALUES ($1, $2, $3, $3, 'available') RETURNING id`,
      [clubId, name, quantity]
    );
    const assetId = rows[0].id;
    await client.query(
      `INSERT INTO stock_movements
         (club_id, asset_id, operator_id, type, quantity_delta, quantity_before, quantity_after, notes)
       VALUES ($1,$2,$3,'purchase',$4,0,$4,'Test setup')`,
      [clubId, assetId, operatorId, quantity]
    );
    await client.query('COMMIT');
    return assetId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteClub(clubId: string): Promise<void> {
  await query('DELETE FROM clubs WHERE id = $1', [clubId]);
}

export async function deleteUsers(emails: string[]): Promise<void> {
  for (const email of emails) {
    await query('DELETE FROM users WHERE email = $1', [email]);
  }
}
