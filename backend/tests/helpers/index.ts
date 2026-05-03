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

export interface CreatedAsset {
  typeId: string;
  batchId: string;
}

export async function createAsset(
  clubId: string,
  operatorId: string,
  name: string,
  quantity = 5
): Promise<CreatedAsset> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Upsert asset name
    const { rows: nameRows } = await client.query<{ id: string }>(
      `INSERT INTO asset_names (club_id, name) VALUES ($1, $2)
       ON CONFLICT (club_id, name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [clubId, name]
    );
    const nameId = nameRows[0].id;

    // Find or create asset type (no brand/model/size)
    const { rows: existingType } = await client.query<{ id: string }>(
      `SELECT id FROM asset_types
       WHERE club_id = $1 AND asset_name_id = $2
         AND brand IS NULL AND model IS NULL AND size IS NULL`,
      [clubId, nameId]
    );
    let typeId: string;
    if (existingType.length) {
      typeId = existingType[0].id;
    } else {
      const { rows: typeRows } = await client.query<{ id: string }>(
        `INSERT INTO asset_types (club_id, asset_name_id) VALUES ($1, $2) RETURNING id`,
        [clubId, nameId]
      );
      typeId = typeRows[0].id;
    }

    // Create batch
    const { rows: batchRows } = await client.query<{ id: string }>(
      `INSERT INTO asset_batches
         (asset_type_id, total_quantity, available_quantity, status,
          purchase_date, purchase_price, useful_life_years)
       VALUES ($1, $2, $2, 'available', '2024-01-01', 50.00, 5) RETURNING id`,
      [typeId, quantity]
    );
    const batchId = batchRows[0].id;

    await client.query(
      `INSERT INTO stock_movements
         (club_id, asset_batch_id, operator_id, type,
          quantity_delta, quantity_before, quantity_after, notes)
       VALUES ($1,$2,$3,'purchase',$4,0,$4,'Test setup')`,
      [clubId, batchId, operatorId, quantity]
    );

    await client.query('COMMIT');
    return { typeId, batchId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteClub(clubId: string): Promise<void> {
  // Nullify optional user FK refs in ALL loans that reference users from this club.
  // This catches stale rows from failed previous runs where users were reused.
  await query(
    `UPDATE loans SET approved_by = NULL, checkout_by = NULL,
     return_confirmed_by = NULL, created_by = NULL
     WHERE approved_by        IN (SELECT id FROM users WHERE club_id = $1)
        OR checkout_by        IN (SELECT id FROM users WHERE club_id = $1)
        OR return_confirmed_by IN (SELECT id FROM users WHERE club_id = $1)
        OR created_by          IN (SELECT id FROM users WHERE club_id = $1)`,
    [clubId]
  );
  // Delete ALL loans/write-offs whose coach or creator belongs to this club
  // (coach_id and created_by are NOT NULL so cannot be nullified)
  await query(
    `DELETE FROM write_off_orders
     WHERE club_id = $1
        OR created_by IN (SELECT id FROM users WHERE club_id = $1)`,
    [clubId]
  );
  await query(
    `DELETE FROM loans
     WHERE club_id = $1
        OR coach_id IN (SELECT id FROM users WHERE club_id = $1)`,
    [clubId]
  );
  // Delete asset_batches before asset_types (RESTRICT FK on legacy schema)
  await query(
    `DELETE FROM asset_batches
     WHERE asset_type_id IN (SELECT id FROM asset_types WHERE club_id = $1)`,
    [clubId]
  );
  await query('DELETE FROM clubs WHERE id = $1', [clubId]);
}

export async function deleteUsers(emails: string[]): Promise<void> {
  for (const email of emails) {
    await query('DELETE FROM users WHERE email = $1', [email]);
  }
}
