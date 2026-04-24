import { query } from '../../src/db';

/** Token format recognised by our Clerk mock: "test|{clerkId}" */
export function authHeader(clerkId: string): Record<string, string> {
  return { Authorization: `Bearer test|${clerkId}` };
}

export async function createClub(name: string): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO clubs (name, sport_type, contact_email) VALUES ($1, 'Testing', $2) RETURNING id`,
    [name, `${name.replace(/\s+/g, '').toLowerCase()}@test.com`]
  );
  return rows[0].id;
}

interface TestUser { id: string; club_id: string | null; clerk_id: string; role: string; }

export async function createUser(
  clerkId: string,
  clubId: string | null,
  role: string
): Promise<TestUser> {
  const { rows } = await query<TestUser>(
    `INSERT INTO users (clerk_id, name, email, club_id, role)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (clerk_id) DO UPDATE SET club_id = EXCLUDED.club_id, role = EXCLUDED.role
     RETURNING id, club_id, clerk_id, role`,
    [clerkId, `Test ${role}`, `${clerkId}@test.com`, clubId, role]
  );
  return rows[0];
}

export async function createAsset(
  clubId: string,
  operatorId: string,
  name: string,
  quantity = 5
): Promise<string> {
  const client = await (await import('../../src/db')).pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO assets (club_id, name, total_quantity, available_quantity, status)
       VALUES ($1, $2, $3, $3, 'available') RETURNING id`,
      [clubId, name, quantity]
    );
    const assetId = rows[0].id;
    await client.query(
      `INSERT INTO stock_movements (club_id, asset_id, operator_id, type, quantity_delta, quantity_before, quantity_after, notes)
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

export async function deleteUsers(clerkIds: string[]): Promise<void> {
  for (const id of clerkIds) {
    await query('DELETE FROM users WHERE clerk_id = $1', [id]);
  }
}
