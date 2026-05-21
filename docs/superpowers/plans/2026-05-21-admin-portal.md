# Admin Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a platform-level admin portal with a dedicated `/admin/login` entry, independent auth context, and full cross-club management capabilities.

**Architecture:** Same React app, isolated under `frontend/src/admin/`. Backend adds `/api/v1/admin/*` route group protected by `requireRole('super_admin')`. Club-facing endpoints are untouched. Admin session uses separate localStorage keys (`admin_token`, `admin_user`).

**Tech Stack:** Express/TypeScript backend, React + Ant Design v5 frontend, Recharts, React Router v6, supertest for backend integration tests.

---

## Phase 1: Backend

### Task 1: Fix login to block users of disabled clubs

**Files:**
- Modify: `backend/src/services/auth.service.ts` (login function, line ~130)
- Modify: `backend/tests/auth.test.ts` (add one describe block at end)

- [ ] **Step 1: Add failing test for disabled-club login**

Append to `backend/tests/auth.test.ts`:

```typescript
describe('POST /api/v1/auth/login — disabled club', () => {
  const disabledEmail = `${PREFIX}disabled@test.com`;
  let disabledClubId: string;

  beforeAll(async () => {
    disabledClubId = await createClub('Auth Disabled Club');
    await createUser(disabledEmail, disabledClubId, 'coach');
    await query('UPDATE clubs SET is_active = false WHERE id = $1', [disabledClubId]);
  });

  afterAll(async () => {
    await deleteClub(disabledClubId);
    await deleteUsers([disabledEmail]);
  });

  it('returns 403 when the user belongs to a disabled club', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: disabledEmail, password: TEST_PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/disabled/i);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd backend && npx jest --testPathPattern=auth --no-coverage 2>&1 | tail -20
```

Expected: `● POST /api/v1/auth/login — disabled club › returns 403`

- [ ] **Step 3: Fix `auth.service.ts` login function**

In `backend/src/services/auth.service.ts`, update the login query and add the check:

```typescript
export async function login(
  email: string,
  password: string
): Promise<{ token: string; user: Record<string, unknown> }> {
  const { rows } = await db.query<
    AuthUser & {
      password_hash: string;
      email_verified: boolean;
      club_name: string | null;
      club_is_active: boolean | null;
    }
  >(
    `SELECT u.id, u.club_id, u.name, u.email, u.role, u.is_active,
            u.password_hash, u.email_verified,
            c.name AS club_name, c.is_active AS club_is_active
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
  if (user.club_id && user.club_is_active === false)
    throw new AppError('This club has been disabled', 403);

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
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd backend && npx jest --testPathPattern=auth --no-coverage 2>&1 | tail -10
```

Expected: all auth tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/auth.service.ts backend/tests/auth.test.ts
git commit -m "feat(auth): block login for users of disabled clubs"
```

---

### Task 2: Write failing admin API tests

**Files:**
- Create: `backend/tests/admin.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
// backend/tests/admin.test.ts
import request from 'supertest';
import app from '../src/app';
import { authHeader, createClub, createUser, createAsset, deleteClub, deleteUsers } from './helpers';
import { query } from '../src/db';

const PREFIX = 't_adm_';
const superAdminEmail = `${PREFIX}sa@test.com`;
const clubAdminEmail  = `${PREFIX}cadmin@test.com`;
const coachEmail      = `${PREFIX}coach@test.com`;

let superAdminId: string;
let clubAdminUserId: string;
let coachUserId: string;
let clubId: string;
let assetTypeId: string;

beforeAll(async () => {
  const sa = await createUser(superAdminEmail, null, 'super_admin');
  superAdminId = sa.id;

  clubId = await createClub(`${PREFIX}Club`);

  const ca = await createUser(clubAdminEmail, clubId, 'club_admin');
  clubAdminUserId = ca.id;

  const coach = await createUser(coachEmail, clubId, 'coach');
  coachUserId = coach.id;

  const asset = await createAsset(clubId, clubAdminUserId, `${PREFIX}Ball`);
  assetTypeId = asset.typeId;
});

afterAll(async () => {
  // Re-enable club in case a test disabled it
  await query('UPDATE clubs SET is_active = true WHERE id = $1', [clubId]);
  await deleteClub(clubId);
  await deleteUsers([superAdminEmail, clubAdminEmail, coachEmail]);
});

// ── Auth guard ────────────────────────────────────────────────────────────────

describe('Admin routes — auth guard', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/admin/stats');
    expect(res.status).toBe(401);
  });

  it('returns 403 for club_admin', async () => {
    const res = await request(app)
      .get('/api/v1/admin/stats')
      .set(authHeader(clubAdminUserId));
    expect(res.status).toBe(403);
  });
});

// ── Platform stats ────────────────────────────────────────────────────────────

describe('GET /api/v1/admin/stats', () => {
  it('returns platform stats for super_admin', async () => {
    const res = await request(app)
      .get('/api/v1/admin/stats')
      .set(authHeader(superAdminId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total_clubs:   expect.any(Number),
      active_clubs:  expect.any(Number),
      total_users:   expect.any(Number),
      total_assets:  expect.any(Number),
      active_loans:  expect.any(Number),
      overdue_loans: expect.any(Number),
    });
    expect(res.body.total_clubs).toBeGreaterThanOrEqual(1);
  });
});

// ── Analytics ─────────────────────────────────────────────────────────────────

describe('GET /api/v1/admin/analytics/*', () => {
  it('overview returns expected keys', async () => {
    const res = await request(app)
      .get('/api/v1/admin/analytics/overview')
      .set(authHeader(superAdminId));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total_clubs');
    expect(res.body).toHaveProperty('asset_by_status');
    expect(res.body).toHaveProperty('total_asset_value');
  });

  it('loans returns monthly_trend and top_assets', async () => {
    const res = await request(app)
      .get('/api/v1/admin/analytics/loans')
      .set(authHeader(superAdminId));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('monthly_trend');
    expect(res.body).toHaveProperty('top_assets');
    expect(Array.isArray(res.body.monthly_trend)).toBe(true);
  });

  it('assets returns by_status and by_category', async () => {
    const res = await request(app)
      .get('/api/v1/admin/analytics/assets')
      .set(authHeader(superAdminId));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('by_status');
    expect(res.body).toHaveProperty('by_category');
  });

  it('growth returns clubs and users arrays', async () => {
    const res = await request(app)
      .get('/api/v1/admin/analytics/growth')
      .set(authHeader(superAdminId));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.clubs)).toBe(true);
    expect(Array.isArray(res.body.users)).toBe(true);
  });
});

// ── Club list + detail ────────────────────────────────────────────────────────

describe('GET /api/v1/admin/clubs', () => {
  it('returns paginated club list with stats', async () => {
    const res = await request(app)
      .get('/api/v1/admin/clubs')
      .set(authHeader(superAdminId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: expect.any(Array), total: expect.any(Number) });
    const club = (res.body.data as Record<string, unknown>[]).find(c => c.id === clubId);
    expect(club).toMatchObject({
      id: clubId,
      user_count:        expect.any(Number),
      asset_count:       expect.any(Number),
      active_loan_count: expect.any(Number),
    });
  });

  it('filters by search', async () => {
    const res = await request(app)
      .get('/api/v1/admin/clubs')
      .query({ search: PREFIX })
      .set(authHeader(superAdminId));
    expect(res.status).toBe(200);
    expect((res.body.data as unknown[]).length).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/v1/admin/clubs/:id', () => {
  it('returns club detail with admin_account and stats', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/clubs/${clubId}`)
      .set(authHeader(superAdminId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: clubId,
      admin_account: { id: clubAdminUserId, email: clubAdminEmail },
      stats: {
        user_count:        expect.any(Number),
        asset_count:       expect.any(Number),
        active_loan_count: expect.any(Number),
        overdue_loan_count: expect.any(Number),
      },
    });
  });

  it('returns 404 for unknown club', async () => {
    const res = await request(app)
      .get('/api/v1/admin/clubs/00000000-0000-0000-0000-000000000000')
      .set(authHeader(superAdminId));
    expect(res.status).toBe(404);
  });
});

// ── Club status ───────────────────────────────────────────────────────────────

describe('PATCH /api/v1/admin/clubs/:id/status', () => {
  it('disables a club', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/clubs/${clubId}/status`)
      .set(authHeader(superAdminId))
      .send({ is_active: false });
    expect(res.status).toBe(200);

    const { rows } = await query<{ is_active: boolean }>(
      'SELECT is_active FROM clubs WHERE id = $1', [clubId]
    );
    expect(rows[0].is_active).toBe(false);
  });

  it('re-enables a club', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/clubs/${clubId}/status`)
      .set(authHeader(superAdminId))
      .send({ is_active: true });
    expect(res.status).toBe(200);
    const { rows } = await query<{ is_active: boolean }>(
      'SELECT is_active FROM clubs WHERE id = $1', [clubId]
    );
    expect(rows[0].is_active).toBe(true);
  });
});

// ── Club admin password reset ─────────────────────────────────────────────────

describe('POST /api/v1/admin/clubs/:id/reset-admin-password', () => {
  it('returns a temp_password and it works for login', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/clubs/${clubId}/reset-admin-password`)
      .set(authHeader(superAdminId));
    expect(res.status).toBe(200);
    expect(typeof res.body.temp_password).toBe('string');
    expect(res.body.temp_password.length).toBeGreaterThanOrEqual(12);

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: clubAdminEmail, password: res.body.temp_password });
    expect(loginRes.status).toBe(200);
  });
});

// ── Users within club ─────────────────────────────────────────────────────────

describe('GET /api/v1/admin/clubs/:id/users', () => {
  it('returns users in the club', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/clubs/${clubId}/users`)
      .set(authHeader(superAdminId));
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(2);
    const emails = (res.body.data as { email: string }[]).map(u => u.email);
    expect(emails).toContain(clubAdminEmail);
    expect(emails).toContain(coachEmail);
  });
});

describe('PATCH /api/v1/admin/clubs/:id/users/:uid/status', () => {
  it('disables and re-enables a user', async () => {
    let res = await request(app)
      .patch(`/api/v1/admin/clubs/${clubId}/users/${coachUserId}/status`)
      .set(authHeader(superAdminId))
      .send({ is_active: false });
    expect(res.status).toBe(200);

    res = await request(app)
      .patch(`/api/v1/admin/clubs/${clubId}/users/${coachUserId}/status`)
      .set(authHeader(superAdminId))
      .send({ is_active: true });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/v1/admin/clubs/:id/users/:uid/reset-password', () => {
  it('returns temp_password and login works', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/clubs/${clubId}/users/${coachUserId}/reset-password`)
      .set(authHeader(superAdminId));
    expect(res.status).toBe(200);
    expect(typeof res.body.temp_password).toBe('string');

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: coachEmail, password: res.body.temp_password });
    expect(loginRes.status).toBe(200);
  });
});

// ── Assets within club ────────────────────────────────────────────────────────

describe('GET /api/v1/admin/clubs/:id/assets', () => {
  it('returns asset list for the club', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/clubs/${clubId}/assets`)
      .set(authHeader(superAdminId));
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    const asset = (res.body.data as { id: string }[]).find(a => a.id === assetTypeId);
    expect(asset).toBeDefined();
  });
});

describe('PATCH /api/v1/admin/clubs/:id/assets/:aid/status', () => {
  it('retires all batches of an asset type', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/clubs/${clubId}/assets/${assetTypeId}/status`)
      .set(authHeader(superAdminId))
      .send({ status: 'retired' });
    expect(res.status).toBe(200);

    const { rows } = await query<{ status: string }>(
      'SELECT DISTINCT status FROM asset_batches WHERE asset_type_id = $1', [assetTypeId]
    );
    expect(rows.every(r => r.status === 'retired')).toBe(true);
  });
});

describe('DELETE /api/v1/admin/clubs/:id/assets/:aid', () => {
  it('hard-deletes the asset type and its batches', async () => {
    // Create a throwaway asset for this test
    const extra = await createAsset(clubId, clubAdminUserId, `${PREFIX}DeleteMe`);

    const res = await request(app)
      .delete(`/api/v1/admin/clubs/${clubId}/assets/${extra.typeId}`)
      .set(authHeader(superAdminId));
    expect(res.status).toBe(200);

    const { rows } = await query<{ id: string }>(
      'SELECT id FROM asset_types WHERE id = $1', [extra.typeId]
    );
    expect(rows.length).toBe(0);
  });
});

// ── Loans within club ─────────────────────────────────────────────────────────

describe('GET /api/v1/admin/clubs/:id/loans', () => {
  it('returns loan list (may be empty)', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/clubs/${clubId}/loans`)
      .set(authHeader(superAdminId));
    expect(res.status).toBe(200);
    expect(typeof res.body.total).toBe('number');
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect all to FAIL**

```bash
cd backend && npx jest --testPathPattern=admin --no-coverage 2>&1 | tail -20
```

Expected: route 404s / cannot GET `/api/v1/admin/stats`.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/admin.test.ts
git commit -m "test(admin): add failing integration tests for admin API"
```

---

### Task 3: Implement `admin.service.ts`

**Files:**
- Create: `backend/src/services/admin.service.ts`

- [ ] **Step 1: Create the file**

```typescript
// backend/src/services/admin.service.ts
import bcrypt from 'bcryptjs';
import * as db from '../db';
import AppError from '../utils/AppError';
import type { PaginatedResult } from '../types';

// ── Internal helpers ──────────────────────────────────────────────────────────

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlatformStats {
  total_clubs: number;
  active_clubs: number;
  total_users: number;
  total_assets: number;
  active_loans: number;
  overdue_loans: number;
}

export interface ClubListItem {
  id: string;
  name: string;
  sport_type: string | null;
  contact_email: string;
  is_active: boolean;
  created_at: string;
  user_count: number;
  asset_count: number;
  active_loan_count: number;
}

export interface ClubAdminAccount {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  email_verified: boolean;
}

export interface ClubDetail {
  id: string;
  name: string;
  sport_type: string | null;
  contact_email: string;
  address: string | null;
  is_active: boolean;
  created_at: string;
  admin_account: ClubAdminAccount | null;
  stats: {
    user_count: number;
    asset_count: number;
    active_loan_count: number;
    overdue_loan_count: number;
  };
}

// ── Platform stats ────────────────────────────────────────────────────────────

export async function getPlatformStats(): Promise<PlatformStats> {
  const { rows } = await db.query<{
    total_clubs: string; active_clubs: string; total_users: string;
    total_assets: string; active_loans: string; overdue_loans: string;
  }>(`
    SELECT
      (SELECT COUNT(*)                                          FROM clubs)                                             AS total_clubs,
      (SELECT COUNT(*)                                          FROM clubs WHERE is_active = true)                      AS active_clubs,
      (SELECT COUNT(*)                                          FROM users WHERE role != 'super_admin')                 AS total_users,
      (SELECT COALESCE(SUM(total_quantity), 0)                  FROM asset_batches)                                     AS total_assets,
      (SELECT COUNT(*)                                          FROM loans WHERE status = 'checked_out')                AS active_loans,
      (SELECT COUNT(*)  FROM loans WHERE status = 'checked_out' AND due_date < CURRENT_DATE)                           AS overdue_loans
  `);
  const r = rows[0];
  return {
    total_clubs:   Number(r.total_clubs),
    active_clubs:  Number(r.active_clubs),
    total_users:   Number(r.total_users),
    total_assets:  Number(r.total_assets),
    active_loans:  Number(r.active_loans),
    overdue_loans: Number(r.overdue_loans),
  };
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export async function getAnalyticsOverview(): Promise<Record<string, unknown>> {
  const stats = await getPlatformStats();
  const { rows: statusRows } = await db.query<{ status: string; total: string }>(
    `SELECT status, COALESCE(SUM(total_quantity), 0)::int AS total FROM asset_batches GROUP BY status`
  );
  const { rows: valueRows } = await db.query<{ total_value: string }>(
    `SELECT COALESCE(SUM(purchase_price * total_quantity), 0) AS total_value FROM asset_batches`
  );
  return {
    ...stats,
    asset_by_status: statusRows.map(r => ({ status: r.status, total: Number(r.total) })),
    total_asset_value: Number(valueRows[0].total_value),
  };
}

export async function getAnalyticsLoans(): Promise<Record<string, unknown>> {
  const { rows: trendRows } = await db.query<{ month: string; loan_count: string }>(
    `SELECT TO_CHAR(DATE_TRUNC('month', l.created_at), 'YYYY-MM') AS month,
            COUNT(DISTINCT l.id)::int AS loan_count
     FROM loans l
     WHERE l.created_at >= NOW() - INTERVAL '12 months'
     GROUP BY 1 ORDER BY 1`
  );
  const { rows: topRows } = await db.query<{ asset_name: string; loan_count: string }>(
    `SELECT an.name AS asset_name, COUNT(li.id)::int AS loan_count
     FROM loan_items li
     JOIN asset_types at2 ON at2.id = li.asset_type_id
     JOIN asset_names an  ON an.id  = at2.asset_name_id
     GROUP BY an.name ORDER BY loan_count DESC LIMIT 10`
  );
  return {
    monthly_trend: trendRows.map(r => ({ month: r.month, loan_count: Number(r.loan_count) })),
    top_assets:    topRows.map(r => ({ asset_name: r.asset_name, loan_count: Number(r.loan_count) })),
  };
}

export async function getAnalyticsAssets(): Promise<Record<string, unknown>> {
  const { rows: statusRows } = await db.query<{
    status: string; batch_count: string; total_qty: string; total_value: string;
  }>(
    `SELECT status,
            COUNT(*)::int                                           AS batch_count,
            COALESCE(SUM(total_quantity), 0)::int                   AS total_qty,
            COALESCE(SUM(purchase_price * total_quantity), 0)       AS total_value
     FROM asset_batches GROUP BY status`
  );
  const { rows: catRows } = await db.query<{
    category: string; type_count: string; total_qty: string; total_value: string;
  }>(
    `SELECT COALESCE(ac.name, 'Uncategorized')                      AS category,
            COUNT(DISTINCT at2.id)::int                              AS type_count,
            COALESCE(SUM(ab.total_quantity), 0)::int                 AS total_qty,
            COALESCE(SUM(ab.purchase_price * ab.total_quantity), 0)  AS total_value
     FROM asset_batches ab
     JOIN asset_types at2 ON at2.id = ab.asset_type_id
     JOIN asset_names an  ON an.id  = at2.asset_name_id
     LEFT JOIN asset_categories ac ON ac.id = an.category_id
     GROUP BY ac.name ORDER BY total_qty DESC`
  );
  return {
    by_status:   statusRows.map(r => ({ status: r.status, batch_count: Number(r.batch_count), total_qty: Number(r.total_qty), total_value: Number(r.total_value) })),
    by_category: catRows.map(r =>    ({ category: r.category, type_count: Number(r.type_count), total_qty: Number(r.total_qty), total_value: Number(r.total_value) })),
  };
}

export async function getAnalyticsGrowth(): Promise<Record<string, unknown>> {
  const { rows: clubRows } = await db.query<{ month: string; new_clubs: string }>(
    `SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month, COUNT(*)::int AS new_clubs
     FROM clubs WHERE created_at >= NOW() - INTERVAL '12 months'
     GROUP BY 1 ORDER BY 1`
  );
  const { rows: userRows } = await db.query<{ month: string; new_users: string }>(
    `SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month, COUNT(*)::int AS new_users
     FROM users WHERE created_at >= NOW() - INTERVAL '12 months' AND role != 'super_admin'
     GROUP BY 1 ORDER BY 1`
  );
  return {
    clubs: clubRows.map(r => ({ month: r.month, new_clubs: Number(r.new_clubs) })),
    users: userRows.map(r => ({ month: r.month, new_users: Number(r.new_users) })),
  };
}

// ── Club management ───────────────────────────────────────────────────────────

export async function listClubs(
  page: number, limit: number, search?: string
): Promise<PaginatedResult<ClubListItem>> {
  const offset = (page - 1) * limit;
  const searchLike = search ? `%${search}%` : null;

  const { rows: countRows } = await db.query<{ count: string }>(
    search ? `SELECT COUNT(*) FROM clubs WHERE name ILIKE $1` : `SELECT COUNT(*) FROM clubs`,
    search ? [searchLike] : []
  );
  const total = Number(countRows[0].count);

  const whereClause = search ? 'WHERE c.name ILIKE $1' : '';
  const paramOffset  = search ? 1 : 0;
  const { rows } = await db.query<ClubListItem>(
    `SELECT c.id, c.name, c.sport_type, c.contact_email, c.is_active, c.created_at,
            COUNT(DISTINCT u.id) FILTER (WHERE u.role != 'super_admin')::int AS user_count,
            COALESCE(SUM(ab.total_quantity), 0)::int                          AS asset_count,
            COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'checked_out')::int AS active_loan_count
     FROM clubs c
     LEFT JOIN users u       ON u.club_id       = c.id
     LEFT JOIN asset_types at2 ON at2.club_id   = c.id
     LEFT JOIN asset_batches ab ON ab.asset_type_id = at2.id
     LEFT JOIN loans l       ON l.club_id        = c.id
     ${whereClause}
     GROUP BY c.id ORDER BY c.created_at DESC
     LIMIT $${paramOffset + 1} OFFSET $${paramOffset + 2}`,
    search ? [searchLike, limit, offset] : [limit, offset]
  );
  return { data: rows, total, page, limit };
}

export async function getClubDetail(clubId: string): Promise<ClubDetail> {
  const { rows } = await db.query<{
    id: string; name: string; sport_type: string | null; contact_email: string;
    address: string | null; is_active: boolean; created_at: string;
    admin_id: string | null; admin_name: string | null; admin_email: string | null;
    admin_is_active: boolean | null; admin_email_verified: boolean | null;
    user_count: string; asset_count: string; active_loan_count: string; overdue_loan_count: string;
  }>(
    `SELECT c.id, c.name, c.sport_type, c.contact_email, c.address, c.is_active, c.created_at,
            u.id              AS admin_id,
            u.name            AS admin_name,
            u.email           AS admin_email,
            u.is_active       AS admin_is_active,
            u.email_verified  AS admin_email_verified,
            (SELECT COUNT(*)::int           FROM users u2      WHERE u2.club_id = c.id AND u2.role != 'super_admin') AS user_count,
            (SELECT COALESCE(SUM(ab.total_quantity),0)::int FROM asset_batches ab JOIN asset_types at2 ON at2.id = ab.asset_type_id WHERE at2.club_id = c.id) AS asset_count,
            (SELECT COUNT(*)::int           FROM loans l       WHERE l.club_id = c.id AND l.status = 'checked_out') AS active_loan_count,
            (SELECT COUNT(*)::int           FROM loans l       WHERE l.club_id = c.id AND l.status = 'checked_out' AND l.due_date < CURRENT_DATE) AS overdue_loan_count
     FROM clubs c
     LEFT JOIN users u ON u.club_id = c.id AND u.role = 'club_admin'
     WHERE c.id = $1`,
    [clubId]
  );
  if (!rows.length) throw new AppError('Club not found', 404);
  const r = rows[0];
  return {
    id: r.id, name: r.name, sport_type: r.sport_type,
    contact_email: r.contact_email, address: r.address,
    is_active: r.is_active, created_at: r.created_at,
    admin_account: r.admin_id
      ? { id: r.admin_id, name: r.admin_name!, email: r.admin_email!, is_active: r.admin_is_active!, email_verified: r.admin_email_verified! }
      : null,
    stats: {
      user_count:         Number(r.user_count),
      asset_count:        Number(r.asset_count),
      active_loan_count:  Number(r.active_loan_count),
      overdue_loan_count: Number(r.overdue_loan_count),
    },
  };
}

export async function updateClubStatus(clubId: string, isActive: boolean): Promise<void> {
  const { rowCount } = await db.query(
    'UPDATE clubs SET is_active = $1 WHERE id = $2', [isActive, clubId]
  );
  if (!rowCount) throw new AppError('Club not found', 404);
}

export async function resetClubAdminPassword(clubId: string): Promise<string> {
  const temp = generateTempPassword();
  const hash = await bcrypt.hash(temp, 10);
  const { rowCount } = await db.query(
    `UPDATE users SET password_hash = $1 WHERE club_id = $2 AND role = 'club_admin'`,
    [hash, clubId]
  );
  if (!rowCount) throw new AppError('No club admin found for this club', 404);
  return temp;
}

// ── User management ───────────────────────────────────────────────────────────

export async function listClubUsers(
  clubId: string, page: number, limit: number
): Promise<PaginatedResult<Record<string, unknown>>> {
  const offset = (page - 1) * limit;
  const { rows: countRows } = await db.query<{ count: string }>(
    `SELECT COUNT(*) FROM users WHERE club_id = $1 AND role != 'super_admin'`, [clubId]
  );
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT id, name, email, role, is_active, email_verified, created_at
     FROM users WHERE club_id = $1 AND role != 'super_admin'
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [clubId, limit, offset]
  );
  return { data: rows, total: Number(countRows[0].count), page, limit };
}

export async function updateUserStatus(
  clubId: string, userId: string, isActive: boolean
): Promise<void> {
  const { rowCount } = await db.query(
    `UPDATE users SET is_active = $1 WHERE id = $2 AND club_id = $3`,
    [isActive, userId, clubId]
  );
  if (!rowCount) throw new AppError('User not found in this club', 404);
}

export async function resetUserPassword(clubId: string, userId: string): Promise<string> {
  const temp = generateTempPassword();
  const hash = await bcrypt.hash(temp, 10);
  const { rowCount } = await db.query(
    `UPDATE users SET password_hash = $1 WHERE id = $2 AND club_id = $3`,
    [hash, userId, clubId]
  );
  if (!rowCount) throw new AppError('User not found in this club', 404);
  return temp;
}

// ── Asset management ──────────────────────────────────────────────────────────

export async function listClubAssets(
  clubId: string, page: number, limit: number
): Promise<PaginatedResult<Record<string, unknown>>> {
  const offset = (page - 1) * limit;
  const { rows: countRows } = await db.query<{ count: string }>(
    `SELECT COUNT(*) FROM asset_types WHERE club_id = $1`, [clubId]
  );
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT at2.id, an.name, at2.brand, at2.model, at2.size,
            COALESCE(SUM(ab.total_quantity), 0)::int       AS total_quantity,
            COALESCE(SUM(ab.available_quantity), 0)::int   AS available_quantity,
            CASE
              WHEN COALESCE(SUM(ab.total_quantity), 0) = 0    THEN 'retired'
              WHEN COALESCE(SUM(ab.available_quantity), 0) = 0 THEN 'on_loan'
              ELSE 'available'
            END AS status,
            at2.created_at
     FROM asset_types at2
     JOIN asset_names an ON an.id = at2.asset_name_id
     LEFT JOIN asset_batches ab ON ab.asset_type_id = at2.id
     WHERE at2.club_id = $1
     GROUP BY at2.id, an.name ORDER BY at2.created_at DESC
     LIMIT $2 OFFSET $3`,
    [clubId, limit, offset]
  );
  return { data: rows, total: Number(countRows[0].count), page, limit };
}

export async function retireAsset(clubId: string, assetTypeId: string): Promise<void> {
  const { rowCount } = await db.query(
    `UPDATE asset_batches SET status = 'retired'
     WHERE asset_type_id = $1
       AND asset_type_id IN (SELECT id FROM asset_types WHERE club_id = $2)`,
    [assetTypeId, clubId]
  );
  if (!rowCount) throw new AppError('Asset not found in this club', 404);
}

export async function deleteAsset(clubId: string, assetTypeId: string): Promise<void> {
  const { rowCount } = await db.query(
    `DELETE FROM asset_types WHERE id = $1 AND club_id = $2`,
    [assetTypeId, clubId]
  );
  if (!rowCount) throw new AppError('Asset not found in this club', 404);
}

// ── Loan records ──────────────────────────────────────────────────────────────

export async function listClubLoans(
  clubId: string, page: number, limit: number, status?: string
): Promise<PaginatedResult<Record<string, unknown>>> {
  const offset = (page - 1) * limit;
  const extraWhere = status ? `AND l.status = $2` : '';
  const countParams: unknown[] = status ? [clubId, status] : [clubId];

  const { rows: countRows } = await db.query<{ count: string }>(
    `SELECT COUNT(*) FROM loans l WHERE l.club_id = $1 ${extraWhere}`, countParams
  );

  const dataParams: unknown[] = status ? [clubId, status, limit, offset] : [clubId, limit, offset];
  const limitIdx  = status ? 3 : 2;
  const offsetIdx = status ? 4 : 3;
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT l.id, l.status, l.due_date, l.created_at,
            u.name AS coach_name,
            COUNT(li.id)::int AS item_count
     FROM loans l
     JOIN users u ON u.id = l.coach_id
     LEFT JOIN loan_items li ON li.loan_id = l.id
     WHERE l.club_id = $1 ${extraWhere}
     GROUP BY l.id, u.name
     ORDER BY l.created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    dataParams
  );
  return { data: rows, total: Number(countRows[0].count), page, limit };
}
```

- [ ] **Step 2: Compile-check**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/admin.service.ts
git commit -m "feat(admin): implement admin service — stats, analytics, club/user/asset/loan ops"
```

---

### Task 4: Implement `admin.controller.ts` and `admin.routes.ts`

**Files:**
- Create: `backend/src/controllers/admin.controller.ts`
- Create: `backend/src/routes/admin.ts`
- Modify: `backend/src/routes/index.ts`

- [ ] **Step 1: Create the controller**

```typescript
// backend/src/controllers/admin.controller.ts
import type { Request, Response, NextFunction } from 'express';
import * as svc from '../services/admin.service';

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try { await fn(req, res); } catch (err) { next(err); }
  };

export const getPlatformStats = wrap(async (_req, res) => {
  res.json(await svc.getPlatformStats());
});

export const getAnalyticsOverview = wrap(async (_req, res) => {
  res.json(await svc.getAnalyticsOverview());
});
export const getAnalyticsLoans = wrap(async (_req, res) => {
  res.json(await svc.getAnalyticsLoans());
});
export const getAnalyticsAssets = wrap(async (_req, res) => {
  res.json(await svc.getAnalyticsAssets());
});
export const getAnalyticsGrowth = wrap(async (_req, res) => {
  res.json(await svc.getAnalyticsGrowth());
});

export const listClubs = wrap(async (req, res) => {
  const page   = Math.max(1, Number(req.query.page)  || 1);
  const limit  = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  res.json(await svc.listClubs(page, limit, search));
});

export const getClubDetail = wrap(async (req, res) => {
  res.json(await svc.getClubDetail(req.params.id));
});

export const updateClubStatus = wrap(async (req, res) => {
  const { is_active } = req.body as { is_active: boolean };
  await svc.updateClubStatus(req.params.id, is_active);
  res.json({ message: 'Club status updated' });
});

export const resetClubAdminPassword = wrap(async (req, res) => {
  const temp_password = await svc.resetClubAdminPassword(req.params.id);
  res.json({ temp_password });
});

export const listClubUsers = wrap(async (req, res) => {
  const page  = Math.max(1, Number(req.query.page)  || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  res.json(await svc.listClubUsers(req.params.id, page, limit));
});

export const updateUserStatus = wrap(async (req, res) => {
  const { is_active } = req.body as { is_active: boolean };
  await svc.updateUserStatus(req.params.id, req.params.uid, is_active);
  res.json({ message: 'User status updated' });
});

export const resetUserPassword = wrap(async (req, res) => {
  const temp_password = await svc.resetUserPassword(req.params.id, req.params.uid);
  res.json({ temp_password });
});

export const listClubAssets = wrap(async (req, res) => {
  const page  = Math.max(1, Number(req.query.page)  || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  res.json(await svc.listClubAssets(req.params.id, page, limit));
});

export const retireAsset = wrap(async (req, res) => {
  await svc.retireAsset(req.params.id, req.params.aid);
  res.json({ message: 'Asset retired' });
});

export const deleteAsset = wrap(async (req, res) => {
  await svc.deleteAsset(req.params.id, req.params.aid);
  res.json({ message: 'Asset deleted' });
});

export const listClubLoans = wrap(async (req, res) => {
  const page   = Math.max(1, Number(req.query.page)  || 1);
  const limit  = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  res.json(await svc.listClubLoans(req.params.id, page, limit, status));
});
```

- [ ] **Step 2: Create the routes file**

```typescript
// backend/src/routes/admin.ts
import { Router } from 'express';
import requireRole from '../middleware/requireRole';
import * as ctrl from '../controllers/admin.controller';

const router = Router();

router.use(requireRole('super_admin'));

router.get('/stats',                                      ctrl.getPlatformStats);
router.get('/analytics/overview',                         ctrl.getAnalyticsOverview);
router.get('/analytics/loans',                            ctrl.getAnalyticsLoans);
router.get('/analytics/assets',                           ctrl.getAnalyticsAssets);
router.get('/analytics/growth',                           ctrl.getAnalyticsGrowth);

router.get('/clubs',                                      ctrl.listClubs);
router.get('/clubs/:id',                                  ctrl.getClubDetail);
router.patch('/clubs/:id/status',                         ctrl.updateClubStatus);
router.post('/clubs/:id/reset-admin-password',            ctrl.resetClubAdminPassword);

router.get('/clubs/:id/users',                            ctrl.listClubUsers);
router.patch('/clubs/:id/users/:uid/status',              ctrl.updateUserStatus);
router.post('/clubs/:id/users/:uid/reset-password',       ctrl.resetUserPassword);

router.get('/clubs/:id/assets',                           ctrl.listClubAssets);
router.patch('/clubs/:id/assets/:aid/status',             ctrl.retireAsset);
router.delete('/clubs/:id/assets/:aid',                   ctrl.deleteAsset);

router.get('/clubs/:id/loans',                            ctrl.listClubLoans);

export default router;
```

- [ ] **Step 3: Mount in `routes/index.ts`**

After the existing imports, add:
```typescript
import adminRouter from './admin';
```

After `router.use(authenticate);`, add before the other `router.use` lines:
```typescript
router.use('/admin', adminRouter);
```

- [ ] **Step 4: Run all tests**

```bash
cd backend && npx jest --no-coverage 2>&1 | tail -20
```

Expected: all tests pass including new admin tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/admin.controller.ts backend/src/routes/admin.ts backend/src/routes/index.ts
git commit -m "feat(admin): add admin controller, routes, and mount at /api/v1/admin"
```

---

## Phase 2: Frontend

### Task 5: Admin API client + AdminAuthContext

**Files:**
- Create: `frontend/src/admin/api/admin.ts`
- Create: `frontend/src/admin/contexts/AdminAuthContext.tsx`

- [ ] **Step 1: Create admin API client**

```typescript
// frontend/src/admin/api/admin.ts
import axios from 'axios';

const TOKEN_KEY = 'admin_token';
const BASE = `${import.meta.env.VITE_API_BASE_URL || '/api/v1'}/admin`;

const adminApi = axios.create({ baseURL: BASE });

adminApi.interceptors.request.use(config => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

adminApi.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('admin_user');
      window.location.href = '/admin/login';
    }
    return Promise.reject(err);
  }
);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlatformStats {
  total_clubs: number;
  active_clubs: number;
  total_users: number;
  total_assets: number;
  active_loans: number;
  overdue_loans: number;
}

export interface ClubListItem {
  id: string;
  name: string;
  sport_type: string | null;
  contact_email: string;
  is_active: boolean;
  created_at: string;
  user_count: number;
  asset_count: number;
  active_loan_count: number;
}

export interface ClubAdminAccount {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  email_verified: boolean;
}

export interface ClubDetail {
  id: string;
  name: string;
  sport_type: string | null;
  contact_email: string;
  address: string | null;
  is_active: boolean;
  created_at: string;
  admin_account: ClubAdminAccount | null;
  stats: {
    user_count: number;
    asset_count: number;
    active_loan_count: number;
    overdue_loan_count: number;
  };
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// ── API functions ─────────────────────────────────────────────────────────────

export const getStats = () =>
  adminApi.get<PlatformStats>('/stats').then(r => r.data);

export const getAnalyticsOverview = () =>
  adminApi.get<Record<string, unknown>>('/analytics/overview').then(r => r.data);

export const getAnalyticsLoans = () =>
  adminApi.get<Record<string, unknown>>('/analytics/loans').then(r => r.data);

export const getAnalyticsAssets = () =>
  adminApi.get<Record<string, unknown>>('/analytics/assets').then(r => r.data);

export const getAnalyticsGrowth = () =>
  adminApi.get<Record<string, unknown>>('/analytics/growth').then(r => r.data);

export const listClubs = (params?: { page?: number; limit?: number; search?: string }) =>
  adminApi.get<Paginated<ClubListItem>>('/clubs', { params }).then(r => r.data);

export const getClubDetail = (id: string) =>
  adminApi.get<ClubDetail>(`/clubs/${id}`).then(r => r.data);

export const updateClubStatus = (id: string, is_active: boolean) =>
  adminApi.patch(`/clubs/${id}/status`, { is_active });

export const resetClubAdminPassword = (id: string) =>
  adminApi.post<{ temp_password: string }>(`/clubs/${id}/reset-admin-password`).then(r => r.data);

export const listClubUsers = (clubId: string, params?: { page?: number; limit?: number }) =>
  adminApi.get<Paginated<Record<string, unknown>>>(`/clubs/${clubId}/users`, { params }).then(r => r.data);

export const updateUserStatus = (clubId: string, userId: string, is_active: boolean) =>
  adminApi.patch(`/clubs/${clubId}/users/${userId}/status`, { is_active });

export const resetUserPassword = (clubId: string, userId: string) =>
  adminApi.post<{ temp_password: string }>(`/clubs/${clubId}/users/${userId}/reset-password`).then(r => r.data);

export const listClubAssets = (clubId: string, params?: { page?: number; limit?: number }) =>
  adminApi.get<Paginated<Record<string, unknown>>>(`/clubs/${clubId}/assets`, { params }).then(r => r.data);

export const retireAsset = (clubId: string, assetTypeId: string) =>
  adminApi.patch(`/clubs/${clubId}/assets/${assetTypeId}/status`, { status: 'retired' });

export const deleteAsset = (clubId: string, assetTypeId: string) =>
  adminApi.delete(`/clubs/${clubId}/assets/${assetTypeId}`);

export const listClubLoans = (
  clubId: string,
  params?: { page?: number; limit?: number; status?: string }
) => adminApi.get<Paginated<Record<string, unknown>>>(`/clubs/${clubId}/loans`, { params }).then(r => r.data);

export default adminApi;
```

- [ ] **Step 2: Create AdminAuthContext**

```typescript
// frontend/src/admin/contexts/AdminAuthContext.tsx
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { AuthUser } from '../../types';
import axios from 'axios';

const TOKEN_KEY = 'admin_token';
const USER_KEY  = 'admin_user';

interface AdminAuthContextValue {
  user: AuthUser | null;
  token: string | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isValidating: boolean;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

function clearStorage() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser]   = useState<AuthUser | null>(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null'); } catch { return null; }
  });
  const [isValidating, setIsValidating] = useState<boolean>(!!localStorage.getItem(TOKEN_KEY));

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) return;
    axios
      .get<AuthUser>(
        `${import.meta.env.VITE_API_BASE_URL || '/api/v1'}/auth/me`,
        { headers: { Authorization: `Bearer ${stored}` } }
      )
      .then(res => {
        if (res.data.role !== 'super_admin') { clearStorage(); setToken(null); setUser(null); return; }
        localStorage.setItem(USER_KEY, JSON.stringify(res.data));
        setUser(res.data);
      })
      .catch(() => { clearStorage(); setToken(null); setUser(null); })
      .finally(() => setIsValidating(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback((newToken: string, newUser: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => { clearStorage(); setToken(null); setUser(null); }, []);

  return (
    <AdminAuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token, isValidating }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/admin/
git commit -m "feat(admin): add AdminAuthContext and admin API client"
```

---

### Task 6: AdminLayout + AdminRouter + wire into App.tsx

**Files:**
- Create: `frontend/src/admin/layouts/AdminLayout.tsx`
- Create: `frontend/src/admin/router/index.tsx`
- Modify: `frontend/src/router/index.tsx`

- [ ] **Step 1: Create AdminLayout**

```tsx
// frontend/src/admin/layouts/AdminLayout.tsx
import { Layout, Menu, Button, Typography } from 'antd';
import {
  DashboardOutlined, BarChartOutlined, BankOutlined, LogoutOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';

const { Sider, Content } = Layout;
const { Text } = Typography;

const NAV_ITEMS = [
  { key: '/admin/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/admin/analytics', icon: <BarChartOutlined />,  label: 'Analytics' },
  { key: '/admin/clubs',     icon: <BankOutlined />,      label: 'Clubs' },
];

export default function AdminLayout() {
  const { user, logout } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const selectedKey =
    NAV_ITEMS.slice(1).find(item => location.pathname.startsWith(item.key))?.key
    ?? '/admin/dashboard';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={220} style={{ background: '#141414', borderRight: '1px solid #1f1f1f', position: 'relative' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1f1f1f' }}>
          <Text style={{ color: '#444', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block' }}>
            SportStock
          </Text>
          <Text style={{ color: '#888', fontSize: 12 }}>Platform Admin</Text>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={NAV_ITEMS.map(({ key, icon, label }) => ({ key, icon, label }))}
          onClick={({ key }) => navigate(key)}
          style={{ background: '#141414', borderRight: 'none', marginTop: 4 }}
        />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 20px', borderTop: '1px solid #1f1f1f' }}>
          <Text style={{ color: '#555', fontSize: 11, display: 'block', marginBottom: 6 }}>{user?.email}</Text>
          <Button
            type="text"
            icon={<LogoutOutlined />}
            size="small"
            style={{ color: '#555', padding: 0, height: 'auto', fontSize: 12 }}
            onClick={() => { logout(); navigate('/admin/login'); }}
          >
            Sign out
          </Button>
        </div>
      </Sider>
      <Layout style={{ background: '#0d0d0d' }}>
        <Content style={{ padding: 24, minHeight: '100vh' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
```

- [ ] **Step 2: Create AdminRouter**

```tsx
// frontend/src/admin/router/index.tsx
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import AdminLayout from '../layouts/AdminLayout';
import LoginPage      from '../pages/Login';
import DashboardPage  from '../pages/Dashboard';
import AnalyticsPage  from '../pages/Analytics';
import ClubsPage      from '../pages/Clubs';
import ClubDetailPage from '../pages/ClubDetail';

function RequireAdminAuth() {
  const { isAuthenticated, isValidating, user } = useAdminAuth();
  if (isValidating) return null;
  if (!isAuthenticated || user?.role !== 'super_admin') return <Navigate to="/admin/login" replace />;
  return <Outlet />;
}

function RedirectIfAdminAuth() {
  const { isAuthenticated, isValidating, user } = useAdminAuth();
  if (isValidating) return null;
  if (isAuthenticated && user?.role === 'super_admin') return <Navigate to="/admin/dashboard" replace />;
  return <Outlet />;
}

export default function AdminRouter() {
  return (
    <Routes>
      <Route element={<RedirectIfAdminAuth />}>
        <Route path="login" element={<LoginPage />} />
      </Route>
      <Route element={<RequireAdminAuth />}>
        <Route element={<AdminLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="clubs"     element={<ClubsPage />} />
          <Route path="clubs/:id" element={<ClubDetailPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="login" replace />} />
    </Routes>
  );
}
```

- [ ] **Step 3: Add admin route to `frontend/src/router/index.tsx`**

Add imports at the top:
```tsx
import { ConfigProvider, theme as antTheme } from 'antd';
import { AdminAuthProvider } from '../admin/contexts/AdminAuthContext';
import AdminRouter from '../admin/router';
```

Inside `AppRouter`'s `<Routes>`, add **before** the `<Route path="*">` catch-all:
```tsx
<Route
  path="/admin/*"
  element={
    <ConfigProvider theme={{ algorithm: antTheme.darkAlgorithm }}>
      <AdminAuthProvider>
        <AdminRouter />
      </AdminAuthProvider>
    </ConfigProvider>
  }
/>
```

- [ ] **Step 4: Compile-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: errors only about missing page files (Login, Dashboard, etc. not yet created).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/admin/layouts/ frontend/src/admin/router/ frontend/src/router/index.tsx
git commit -m "feat(admin): add AdminLayout, AdminRouter, wire into app router"
```

---

### Task 7: Admin Login page

**Files:**
- Create: `frontend/src/admin/pages/Login/index.tsx`

- [ ] **Step 1: Create the login page**

```tsx
// frontend/src/admin/pages/Login/index.tsx
import { Form, Input, Button, Typography, Alert, Card } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAdminAuth } from '../../contexts/AdminAuthContext';
import type { AuthUser } from '../../../types';

const { Title, Text } = Typography;

interface LoginForm {
  email: string;
  password: string;
}

export default function AdminLoginPage() {
  const { login } = useAdminAuth();
  const navigate   = useNavigate();
  const [loading, setLoading]     = useState(false);
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);

  const handleSubmit = async (values: LoginForm) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await axios.post<{ token: string; user: AuthUser }>(
        `${import.meta.env.VITE_API_BASE_URL || '/api/v1'}/auth/login`,
        { email: values.email, password: values.password }
      );
      if (res.data.user.role !== 'super_admin') {
        setErrorMsg('This portal is for platform administrators only.');
        return;
      }
      login(res.data.token, res.data.user);
      navigate('/admin/dashboard');
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setErrorMsg(err.response?.data?.message ?? 'Login failed.');
      } else {
        setErrorMsg('An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#0a0a0a',
    }}>
      <Card style={{ width: 380, background: '#141414', border: '1px solid #1f1f1f' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Text style={{ color: '#444', fontSize: 11, textTransform: 'uppercase', letterSpacing: 2 }}>
            SportStock
          </Text>
          <Title level={4} style={{ color: '#fff', margin: '8px 0 0' }}>
            Platform Admin
          </Title>
        </div>

        {errorMsg && (
          <Alert message={errorMsg} type="error" showIcon style={{ marginBottom: 16 }} />
        )}

        <Form layout="vertical" onFinish={handleSubmit} requiredMark={false}>
          <Form.Item
            name="email"
            rules={[{ required: true, message: 'Email is required' }, { type: 'email', message: 'Enter a valid email' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="Email" size="large" />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Password is required' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Password" size="large" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" block size="large" loading={loading}>
              Sign In
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Start dev server and verify login flow**

```bash
cd frontend && npm run dev
```

Navigate to `http://localhost:5173/admin/login`. Verify:
- Login with non-admin creds shows "This portal is for platform administrators only."
- Login with `admin@sportstock.com` / `Admin@SportStock2024` redirects to `/admin/dashboard` (shows blank layout for now).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/admin/pages/Login/
git commit -m "feat(admin): add admin login page"
```

---

### Task 8: Admin Dashboard page

**Files:**
- Create: `frontend/src/admin/pages/Dashboard/index.tsx`

- [ ] **Step 1: Create the dashboard page**

```tsx
// frontend/src/admin/pages/Dashboard/index.tsx
import { useEffect, useState } from 'react';
import { Row, Col, Statistic, Card, Table, Tag, Typography, Spin, App } from 'antd';
import { BankOutlined, TeamOutlined, InboxOutlined, SwapOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getStats, listClubs } from '../../api/admin';
import type { PlatformStats, ClubListItem } from '../../api/admin';

const { Title } = Typography;

export default function AdminDashboardPage() {
  const { message } = App.useApp();
  const navigate    = useNavigate();
  const [stats,     setStats]     = useState<PlatformStats | null>(null);
  const [clubs,     setClubs]     = useState<ClubListItem[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([getStats(), listClubs({ page: 1, limit: 5 })])
      .then(([s, c]) => {
        if (!active) return;
        setStats(s);
        setClubs(c.data);
      })
      .catch(() => message.error('Failed to load dashboard data'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Spin style={{ display: 'block', margin: '80px auto' }} />;

  const columns = [
    { title: 'Club', dataIndex: 'name', key: 'name',
      render: (name: string, r: ClubListItem) => (
        <a onClick={() => navigate(`/admin/clubs/${r.id}`)} style={{ color: '#1668dc' }}>{name}</a>
      ) },
    { title: 'Users',        dataIndex: 'user_count',        key: 'user_count' },
    { title: 'Assets',       dataIndex: 'asset_count',       key: 'asset_count' },
    { title: 'Active Loans', dataIndex: 'active_loan_count', key: 'active_loan_count' },
    { title: 'Status', dataIndex: 'is_active', key: 'is_active',
      render: (v: boolean) => <Tag color={v ? 'success' : 'error'}>{v ? 'Active' : 'Disabled'}</Tag> },
  ];

  return (
    <div>
      <Title level={4} style={{ color: '#fff', marginBottom: 24 }}>Dashboard</Title>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        {[
          { title: 'Total Clubs',    value: stats?.total_clubs,   icon: <BankOutlined />,   color: '#1668dc' },
          { title: 'Total Users',    value: stats?.total_users,   icon: <TeamOutlined />,   color: '#52c41a' },
          { title: 'Total Assets',   value: stats?.total_assets,  icon: <InboxOutlined />,  color: '#faad14' },
          { title: 'Overdue Loans',  value: stats?.overdue_loans, icon: <SwapOutlined />,   color: '#ff4d4f' },
        ].map(item => (
          <Col xs={12} sm={6} key={item.title}>
            <Card style={{ background: '#1a1a1a', border: '1px solid #252525' }}>
              <Statistic
                title={<span style={{ color: '#555', fontSize: 12 }}>{item.title}</span>}
                value={item.value ?? 0}
                valueStyle={{ color: item.color }}
                prefix={item.icon}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Card
        title={<span style={{ color: '#aaa' }}>Recent Clubs</span>}
        extra={<a onClick={() => navigate('/admin/clubs')} style={{ color: '#1668dc', fontSize: 12 }}>View all</a>}
        style={{ background: '#1a1a1a', border: '1px solid #252525' }}
      >
        <Table
          dataSource={clubs}
          columns={columns}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Navigate to `/admin/dashboard`. Confirm stats cards and club table render.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/admin/pages/Dashboard/
git commit -m "feat(admin): add admin dashboard page with platform stats"
```

---

### Task 9: Admin Analytics page

**Files:**
- Create: `frontend/src/admin/pages/Analytics/index.tsx`

- [ ] **Step 1: Create the analytics page**

```tsx
// frontend/src/admin/pages/Analytics/index.tsx
import { useEffect, useState } from 'react';
import { Tabs, Card, Row, Col, Statistic, Typography, Spin, App, Table } from 'antd';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  getAnalyticsOverview, getAnalyticsLoans,
  getAnalyticsAssets, getAnalyticsGrowth,
} from '../../api/admin';

const { Title } = Typography;
const COLORS = ['#1668dc', '#52c41a', '#faad14', '#ff4d4f', '#722ed1'];

export default function AdminAnalyticsPage() {
  const { message } = App.useApp();
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [loans,    setLoans]    = useState<Record<string, unknown> | null>(null);
  const [assets,   setAssets]   = useState<Record<string, unknown> | null>(null);
  const [growth,   setGrowth]   = useState<Record<string, unknown> | null>(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      getAnalyticsOverview(), getAnalyticsLoans(),
      getAnalyticsAssets(),   getAnalyticsGrowth(),
    ])
      .then(([o, l, a, g]) => {
        if (!active) return;
        setOverview(o); setLoans(l); setAssets(a); setGrowth(g);
      })
      .catch(() => message.error('Failed to load analytics'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Spin style={{ display: 'block', margin: '80px auto' }} />;

  const overviewTab = (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        {[
          { label: 'Total Clubs',  value: overview?.total_clubs,  color: '#1668dc' },
          { label: 'Active Clubs', value: overview?.active_clubs, color: '#52c41a' },
          { label: 'Total Users',  value: overview?.total_users,  color: '#faad14' },
          { label: 'Total Assets', value: overview?.total_assets, color: '#722ed1' },
          { label: 'Active Loans', value: overview?.active_loans, color: '#13c2c2' },
          { label: 'Overdue Loans',value: overview?.overdue_loans,color: '#ff4d4f' },
        ].map(s => (
          <Col xs={12} sm={8} md={4} key={s.label}>
            <Card size="small" style={{ background: '#1a1a1a', border: '1px solid #252525' }}>
              <Statistic
                title={<span style={{ color: '#555', fontSize: 11 }}>{s.label}</span>}
                value={s.value as number ?? 0}
                valueStyle={{ color: s.color, fontSize: 20 }}
              />
            </Card>
          </Col>
        ))}
      </Row>
      <Card title={<span style={{ color: '#aaa' }}>Asset Distribution by Status</span>}
            style={{ background: '#1a1a1a', border: '1px solid #252525' }}>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={(overview?.asset_by_status as { status: string; total: number }[]) ?? []}
              dataKey="total" nameKey="status" cx="50%" cy="50%" outerRadius={80}
              label={({ status, total }) => `${status}: ${total}`}
            >
              {((overview?.asset_by_status as { status: string }[]) ?? []).map((_e, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );

  const loanTab = (
    <div>
      <Card title={<span style={{ color: '#aaa' }}>Monthly Loan Count (last 12 months)</span>}
            style={{ background: '#1a1a1a', border: '1px solid #252525', marginBottom: 16 }}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={(loans?.monthly_trend as object[]) ?? []}>
            <XAxis dataKey="month" tick={{ fill: '#555', fontSize: 11 }} />
            <YAxis tick={{ fill: '#555', fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="loan_count" stroke="#1668dc" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
      <Card title={<span style={{ color: '#aaa' }}>Top 10 Borrowed Assets</span>}
            style={{ background: '#1a1a1a', border: '1px solid #252525' }}>
        <Table
          dataSource={(loans?.top_assets as object[]) ?? []}
          rowKey="asset_name"
          size="small"
          pagination={false}
          columns={[
            { title: 'Asset', dataIndex: 'asset_name', key: 'asset_name' },
            { title: 'Loan Count', dataIndex: 'loan_count', key: 'loan_count' },
          ]}
        />
      </Card>
    </div>
  );

  const assetTab = (
    <div>
      <Card title={<span style={{ color: '#aaa' }}>Assets by Category</span>}
            style={{ background: '#1a1a1a', border: '1px solid #252525', marginBottom: 16 }}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={(assets?.by_category as object[]) ?? []}>
            <XAxis dataKey="category" tick={{ fill: '#555', fontSize: 11 }} />
            <YAxis tick={{ fill: '#555', fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="total_qty" fill="#1668dc" name="Qty" />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );

  const growthTab = (
    <Card title={<span style={{ color: '#aaa' }}>Club & User Growth (last 12 months)</span>}
          style={{ background: '#1a1a1a', border: '1px solid #252525' }}>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart>
          <XAxis dataKey="month" tick={{ fill: '#555', fontSize: 11 }} />
          <YAxis tick={{ fill: '#555', fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Line data={(growth?.clubs as object[]) ?? []} type="monotone" dataKey="new_clubs" stroke="#1668dc" name="New Clubs" dot={false} />
          <Line data={(growth?.users as object[]) ?? []} type="monotone" dataKey="new_users" stroke="#52c41a" name="New Users" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );

  return (
    <div>
      <Title level={4} style={{ color: '#fff', marginBottom: 24 }}>Platform Analytics</Title>
      <Tabs
        items={[
          { key: 'overview', label: 'Overview',       children: overviewTab },
          { key: 'loans',    label: 'Loan Analysis',  children: loanTab },
          { key: 'assets',   label: 'Asset Analysis', children: assetTab },
          { key: 'growth',   label: 'Growth Trends',  children: growthTab },
        ]}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser** — navigate to `/admin/analytics`, confirm 4 tabs render with charts.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/admin/pages/Analytics/
git commit -m "feat(admin): add analytics page with 4 tabs"
```

---

### Task 10: Admin Clubs list page

**Files:**
- Create: `frontend/src/admin/pages/Clubs/index.tsx`

- [ ] **Step 1: Create clubs list page**

```tsx
// frontend/src/admin/pages/Clubs/index.tsx
import { useEffect, useState, useCallback } from 'react';
import { Table, Tag, Input, Button, Typography, App, Space } from 'antd';
import { SearchOutlined, EyeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { listClubs } from '../../api/admin';
import type { ClubListItem } from '../../api/admin';

const { Title } = Typography;

export default function AdminClubsPage() {
  const { message } = App.useApp();
  const navigate    = useNavigate();
  const [data,     setData]     = useState<ClubListItem[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(false);
  const [search,   setSearch]   = useState('');

  const fetchClubs = useCallback(async (p: number, s: string) => {
    setLoading(true);
    try {
      const res = await listClubs({ page: p, limit: 20, search: s || undefined });
      setData(res.data);
      setTotal(res.total);
    } catch {
      message.error('Failed to load clubs');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { fetchClubs(page, search); }, [page, search, fetchClubs]);

  const columns = [
    { title: 'Club Name',    dataIndex: 'name',             key: 'name',
      render: (v: string, r: ClubListItem) => (
        <a onClick={() => navigate(`/admin/clubs/${r.id}`)} style={{ color: '#1668dc' }}>{v}</a>
      )},
    { title: 'Sport',        dataIndex: 'sport_type',       key: 'sport_type', render: (v: string | null) => v ?? '—' },
    { title: 'Users',        dataIndex: 'user_count',       key: 'user_count' },
    { title: 'Assets',       dataIndex: 'asset_count',      key: 'asset_count' },
    { title: 'Active Loans', dataIndex: 'active_loan_count',key: 'active_loan_count' },
    { title: 'Status', dataIndex: 'is_active', key: 'is_active',
      render: (v: boolean) => <Tag color={v ? 'success' : 'error'}>{v ? 'Active' : 'Disabled'}</Tag> },
    { title: '', key: 'actions',
      render: (_: unknown, r: ClubListItem) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/admin/clubs/${r.id}`)}>
          View
        </Button>
      ) },
  ];

  return (
    <div>
      <Title level={4} style={{ color: '#fff', marginBottom: 16 }}>Clubs</Title>
      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="Search by name..."
          prefix={<SearchOutlined />}
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{ width: 260 }}
          allowClear
        />
      </Space>
      <Table
        dataSource={data}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ current: page, pageSize: 20, total, onChange: setPage, showSizeChanger: false }}
        size="small"
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser** — `/admin/clubs` shows searchable table.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/admin/pages/Clubs/
git commit -m "feat(admin): add clubs list page"
```

---

### Task 11: Club Detail page + OverviewTab

**Files:**
- Create: `frontend/src/admin/pages/ClubDetail/index.tsx`
- Create: `frontend/src/admin/pages/ClubDetail/tabs/OverviewTab.tsx`

- [ ] **Step 1: Create OverviewTab**

```tsx
// frontend/src/admin/pages/ClubDetail/tabs/OverviewTab.tsx
import { Row, Col, Card, Descriptions, Tag, Button, Statistic, Modal, Typography, App } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { updateClubStatus, resetClubAdminPassword } from '../../../api/admin';
import type { ClubDetail } from '../../../api/admin';

const { Text } = Typography;

interface Props {
  club: ClubDetail;
  onRefresh: () => void;
}

export default function OverviewTab({ club, onRefresh }: Props) {
  const { message, modal } = App.useApp();
  const [disabling,  setDisabling]  = useState(false);
  const [resetting,  setResetting]  = useState(false);

  const handleToggleStatus = () => {
    const action = club.is_active ? 'disable' : 'enable';
    modal.confirm({
      title: `${club.is_active ? 'Disable' : 'Enable'} Club`,
      icon: <ExclamationCircleOutlined />,
      content: club.is_active
        ? `Disabling "${club.name}" will prevent all its members from logging in.`
        : `Re-enabling "${club.name}" will restore access for all its members.`,
      okText: action.charAt(0).toUpperCase() + action.slice(1),
      okButtonProps: { danger: club.is_active },
      onOk: async () => {
        setDisabling(true);
        try {
          await updateClubStatus(club.id, !club.is_active);
          message.success(`Club ${action}d successfully`);
          onRefresh();
        } catch {
          message.error(`Failed to ${action} club`);
        } finally {
          setDisabling(false);
        }
      },
    });
  };

  const handleResetAdminPassword = () => {
    modal.confirm({
      title: 'Reset Admin Password',
      content: `Generate a new temporary password for the admin account of "${club.name}"? You will need to share it with them.`,
      onOk: async () => {
        setResetting(true);
        try {
          const { temp_password } = await resetClubAdminPassword(club.id);
          modal.info({
            title: 'Temporary Password',
            content: (
              <div>
                <Text>Share this password with the club admin:</Text>
                <br />
                <Text code copyable style={{ fontSize: 16, marginTop: 8, display: 'block' }}>
                  {temp_password}
                </Text>
              </div>
            ),
          });
          onRefresh();
        } catch {
          message.error('Failed to reset admin password');
        } finally {
          setResetting(false);
        }
      },
    });
  };

  return (
    <Row gutter={16}>
      {/* Club Info */}
      <Col xs={24} md={8}>
        <Card
          style={{ background: '#1a1a1a', border: '1px solid #252525', height: '100%' }}
          bodyStyle={{ display: 'flex', flexDirection: 'column', height: '100%' }}
        >
          <Text style={{ color: '#444', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 12 }}>
            Club Info
          </Text>
          <Descriptions column={1} size="small" style={{ flex: 1 }}>
            <Descriptions.Item label="Name">{club.name}</Descriptions.Item>
            <Descriptions.Item label="Sport">{club.sport_type ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Email">{club.contact_email}</Descriptions.Item>
            <Descriptions.Item label="Address">{club.address ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Created">{new Date(club.created_at).toLocaleDateString()}</Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={club.is_active ? 'success' : 'error'}>{club.is_active ? 'Active' : 'Disabled'}</Tag>
            </Descriptions.Item>
          </Descriptions>
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #252525' }}>
            <Button
              danger={club.is_active}
              block
              loading={disabling}
              onClick={handleToggleStatus}
            >
              {club.is_active ? 'Disable Club' : 'Enable Club'}
            </Button>
          </div>
        </Card>
      </Col>

      {/* Club Admin Account */}
      <Col xs={24} md={8}>
        <Card
          style={{ background: '#1a1a1a', border: '1px solid #252525', height: '100%' }}
          bodyStyle={{ display: 'flex', flexDirection: 'column', height: '100%' }}
        >
          <Text style={{ color: '#444', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 12 }}>
            Club Admin Account
          </Text>
          {club.admin_account ? (
            <>
              <Descriptions column={1} size="small" style={{ flex: 1 }}>
                <Descriptions.Item label="Name">{club.admin_account.name}</Descriptions.Item>
                <Descriptions.Item label="Email">{club.admin_account.email}</Descriptions.Item>
                <Descriptions.Item label="Status">
                  <Tag color={club.admin_account.is_active ? 'success' : 'error'}>
                    {club.admin_account.is_active ? 'Active' : 'Disabled'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Verified">
                  {club.admin_account.email_verified ? 'Yes' : 'No'}
                </Descriptions.Item>
              </Descriptions>
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #252525' }}>
                <Button block loading={resetting} onClick={handleResetAdminPassword}>
                  Reset Admin Password
                </Button>
              </div>
            </>
          ) : (
            <Text style={{ color: '#555' }}>No club admin found.</Text>
          )}
        </Card>
      </Col>

      {/* Quick Stats */}
      <Col xs={24} md={8}>
        <Card style={{ background: '#1a1a1a', border: '1px solid #252525' }}>
          <Text style={{ color: '#444', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 12 }}>
            Quick Stats
          </Text>
          <Row gutter={[12, 12]}>
            {[
              { label: 'Users',        value: club.stats.user_count,         color: '#1668dc' },
              { label: 'Assets',       value: club.stats.asset_count,        color: '#52c41a' },
              { label: 'Active Loans', value: club.stats.active_loan_count,  color: '#faad14' },
              { label: 'Overdue',      value: club.stats.overdue_loan_count, color: '#ff4d4f' },
            ].map(s => (
              <Col span={12} key={s.label}>
                <Statistic
                  title={<span style={{ color: '#555', fontSize: 11 }}>{s.label}</span>}
                  value={s.value}
                  valueStyle={{ color: s.color, fontSize: 22 }}
                />
              </Col>
            ))}
          </Row>
        </Card>
      </Col>
    </Row>
  );
}
```

- [ ] **Step 2: Create ClubDetail page skeleton**

```tsx
// frontend/src/admin/pages/ClubDetail/index.tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Tabs, Button, Typography, Spin, App } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { getClubDetail } from '../../api/admin';
import type { ClubDetail } from '../../api/admin';
import OverviewTab from './tabs/OverviewTab';
import UsersTab    from './tabs/UsersTab';
import AssetsTab   from './tabs/AssetsTab';
import LoansTab    from './tabs/LoansTab';

const { Title } = Typography;

export default function ClubDetailPage() {
  const { id }    = useParams<{ id: string }>();
  const navigate  = useNavigate();
  const { message } = App.useApp();
  const [club,    setClub]    = useState<ClubDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchClub = async () => {
    if (!id) return;
    try {
      setClub(await getClubDetail(id));
    } catch {
      message.error('Failed to load club details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchClub(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Spin style={{ display: 'block', margin: '80px auto' }} />;
  if (!club || !id) return null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Button icon={<ArrowLeftOutlined />} type="text" style={{ color: '#555' }} onClick={() => navigate('/admin/clubs')} />
        <Title level={4} style={{ color: '#fff', margin: 0 }}>{club.name}</Title>
      </div>
      <Tabs
        items={[
          { key: 'overview', label: 'Overview', children: <OverviewTab club={club} onRefresh={fetchClub} /> },
          { key: 'users',    label: 'Users',    children: <UsersTab clubId={id} /> },
          { key: 'assets',   label: 'Assets',   children: <AssetsTab clubId={id} /> },
          { key: 'loans',    label: 'Loans',    children: <LoansTab clubId={id} /> },
        ]}
      />
    </div>
  );
}
```

- [ ] **Step 3: Commit (with stub tabs)**

Create placeholder files so TypeScript compiles:

```tsx
// frontend/src/admin/pages/ClubDetail/tabs/UsersTab.tsx
export default function UsersTab({ clubId }: { clubId: string }) {
  return <div style={{ color: '#555' }}>Users — {clubId}</div>;
}
```

```tsx
// frontend/src/admin/pages/ClubDetail/tabs/AssetsTab.tsx
export default function AssetsTab({ clubId }: { clubId: string }) {
  return <div style={{ color: '#555' }}>Assets — {clubId}</div>;
}
```

```tsx
// frontend/src/admin/pages/ClubDetail/tabs/LoansTab.tsx
export default function LoansTab({ clubId }: { clubId: string }) {
  return <div style={{ color: '#555' }}>Loans — {clubId}</div>;
}
```

```bash
git add frontend/src/admin/pages/ClubDetail/
git commit -m "feat(admin): add club detail page with overview tab"
```

---

### Task 12: UsersTab

**Files:**
- Modify: `frontend/src/admin/pages/ClubDetail/tabs/UsersTab.tsx`

- [ ] **Step 1: Implement UsersTab**

```tsx
// frontend/src/admin/pages/ClubDetail/tabs/UsersTab.tsx
import { useEffect, useState, useCallback } from 'react';
import { Table, Tag, Button, Space, App, Modal, Typography } from 'antd';
import { listClubUsers, updateUserStatus, resetUserPassword } from '../../../api/admin';

const { Text } = Typography;

interface User {
  id: string; name: string; email: string; role: string;
  is_active: boolean; email_verified: boolean; created_at: string;
}

export default function UsersTab({ clubId }: { clubId: string }) {
  const { message, modal } = App.useApp();
  const [data,    setData]    = useState<User[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await listClubUsers(clubId, { page: p, limit: 20 });
      setData(res.data as User[]);
      setTotal(res.total);
    } catch { message.error('Failed to load users'); }
    finally { setLoading(false); }
  }, [clubId, message]);

  useEffect(() => { fetch(page); }, [page, fetch]);

  const handleToggleStatus = (user: User) => {
    const action = user.is_active ? 'disable' : 'enable';
    modal.confirm({
      title: `${user.is_active ? 'Disable' : 'Enable'} User`,
      content: `${action.charAt(0).toUpperCase() + action.slice(1)} account for ${user.email}?`,
      okButtonProps: { danger: user.is_active },
      onOk: async () => {
        await updateUserStatus(clubId, user.id, !user.is_active);
        message.success('User status updated');
        fetch(page);
      },
    });
  };

  const handleResetPassword = (user: User) => {
    modal.confirm({
      title: 'Reset Password',
      content: `Generate a temporary password for ${user.email}?`,
      onOk: async () => {
        const { temp_password } = await resetUserPassword(clubId, user.id);
        modal.info({
          title: 'Temporary Password',
          content: (
            <div>
              <Text>Share this password with the user:</Text>
              <br />
              <Text code copyable style={{ fontSize: 16, marginTop: 8, display: 'block' }}>
                {temp_password}
              </Text>
            </div>
          ),
        });
      },
    });
  };

  const columns = [
    { title: 'Name',  dataIndex: 'name',  key: 'name' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Role',  dataIndex: 'role',  key: 'role',
      render: (v: string) => <Tag>{v.replace('_', ' ')}</Tag> },
    { title: 'Status', dataIndex: 'is_active', key: 'is_active',
      render: (v: boolean) => <Tag color={v ? 'success' : 'error'}>{v ? 'Active' : 'Disabled'}</Tag> },
    { title: 'Actions', key: 'actions',
      render: (_: unknown, r: User) => (
        <Space>
          <Button size="small" danger={r.is_active} onClick={() => handleToggleStatus(r)}>
            {r.is_active ? 'Disable' : 'Enable'}
          </Button>
          <Button size="small" onClick={() => handleResetPassword(r)}>
            Reset Password
          </Button>
        </Space>
      ) },
  ];

  return (
    <Table
      dataSource={data}
      columns={columns}
      rowKey="id"
      loading={loading}
      pagination={{ current: page, pageSize: 20, total, onChange: setPage, showSizeChanger: false }}
      size="small"
    />
  );
}
```

- [ ] **Step 2: Verify in browser** — Users tab shows user table with disable + reset password actions.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/admin/pages/ClubDetail/tabs/UsersTab.tsx
git commit -m "feat(admin): implement users tab in club detail"
```

---

### Task 13: AssetsTab + LoansTab

**Files:**
- Modify: `frontend/src/admin/pages/ClubDetail/tabs/AssetsTab.tsx`
- Modify: `frontend/src/admin/pages/ClubDetail/tabs/LoansTab.tsx`

- [ ] **Step 1: Implement AssetsTab**

```tsx
// frontend/src/admin/pages/ClubDetail/tabs/AssetsTab.tsx
import { useEffect, useState, useCallback } from 'react';
import { Table, Tag, Button, Space, App, Typography } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { listClubAssets, retireAsset, deleteAsset } from '../../../api/admin';

const { Text } = Typography;

interface Asset {
  id: string; name: string; brand: string | null; model: string | null;
  size: string | null; total_quantity: number; available_quantity: number;
  status: string; created_at: string;
}

export default function AssetsTab({ clubId }: { clubId: string }) {
  const { message, modal } = App.useApp();
  const [data,    setData]    = useState<Asset[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await listClubAssets(clubId, { page: p, limit: 20 });
      setData(res.data as Asset[]);
      setTotal(res.total);
    } catch { message.error('Failed to load assets'); }
    finally { setLoading(false); }
  }, [clubId, message]);

  useEffect(() => { fetch(page); }, [page, fetch]);

  const handleRetire = (asset: Asset) => {
    modal.confirm({
      title: 'Retire Asset',
      icon: <ExclamationCircleOutlined />,
      content: `Retire all batches of "${asset.name}"? This marks them as unavailable.`,
      okText: 'Retire',
      onOk: async () => {
        await retireAsset(clubId, asset.id);
        message.success('Asset retired');
        fetch(page);
      },
    });
  };

  const handleDelete = (asset: Asset) => {
    modal.confirm({
      title: 'Delete Asset',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <Text>Permanently delete <Text strong>"{asset.name}"</Text>?</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            All batches will be removed. Stock movement records will lose the asset reference.
            This cannot be undone.
          </Text>
        </div>
      ),
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteAsset(clubId, asset.id);
        message.success('Asset deleted');
        fetch(page);
      },
    });
  };

  const statusColor: Record<string, string> = {
    available: 'success', on_loan: 'processing', maintenance: 'warning', retired: 'error',
  };

  const columns = [
    { title: 'Name',  dataIndex: 'name',  key: 'name' },
    { title: 'Brand', dataIndex: 'brand', key: 'brand', render: (v: string | null) => v ?? '—' },
    { title: 'Qty',   dataIndex: 'total_quantity', key: 'total_quantity' },
    { title: 'Available', dataIndex: 'available_quantity', key: 'available_quantity' },
    { title: 'Status', dataIndex: 'status', key: 'status',
      render: (v: string) => <Tag color={statusColor[v] ?? 'default'}>{v}</Tag> },
    { title: 'Actions', key: 'actions',
      render: (_: unknown, r: Asset) => (
        <Space>
          <Button size="small" disabled={r.status === 'retired'} onClick={() => handleRetire(r)}>
            Retire
          </Button>
          <Button size="small" danger onClick={() => handleDelete(r)}>
            Delete
          </Button>
        </Space>
      ) },
  ];

  return (
    <Table
      dataSource={data}
      columns={columns}
      rowKey="id"
      loading={loading}
      pagination={{ current: page, pageSize: 20, total, onChange: setPage, showSizeChanger: false }}
      size="small"
    />
  );
}
```

- [ ] **Step 2: Implement LoansTab**

```tsx
// frontend/src/admin/pages/ClubDetail/tabs/LoansTab.tsx
import { useEffect, useState, useCallback } from 'react';
import { Table, Tag, Select, Space, App } from 'antd';
import { listClubLoans } from '../../../api/admin';

interface Loan {
  id: string; status: string; due_date: string;
  coach_name: string; item_count: number; created_at: string;
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'default', approved: 'blue', rejected: 'error',
  checked_out: 'processing', returned: 'success',
};

export default function LoansTab({ clubId }: { clubId: string }) {
  const { message } = App.useApp();
  const [data,      setData]      = useState<Loan[]>([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [status,    setStatus]    = useState<string | undefined>(undefined);
  const [loading,   setLoading]   = useState(false);

  const fetch = useCallback(async (p: number, s?: string) => {
    setLoading(true);
    try {
      const res = await listClubLoans(clubId, { page: p, limit: 20, status: s });
      setData(res.data as Loan[]);
      setTotal(res.total);
    } catch { message.error('Failed to load loans'); }
    finally { setLoading(false); }
  }, [clubId, message]);

  useEffect(() => { fetch(page, status); }, [page, status, fetch]);

  const columns = [
    { title: 'Coach',    dataIndex: 'coach_name', key: 'coach_name' },
    { title: 'Items',    dataIndex: 'item_count', key: 'item_count' },
    { title: 'Due',      dataIndex: 'due_date',   key: 'due_date',
      render: (v: string) => new Date(v).toLocaleDateString() },
    { title: 'Status', dataIndex: 'status', key: 'status',
      render: (v: string) => <Tag color={STATUS_COLOR[v] ?? 'default'}>{v}</Tag> },
    { title: 'Created', dataIndex: 'created_at', key: 'created_at',
      render: (v: string) => new Date(v).toLocaleDateString() },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Select
          placeholder="Filter by status"
          allowClear
          style={{ width: 180 }}
          onChange={(v: string | undefined) => { setStatus(v); setPage(1); }}
          options={[
            { value: 'pending',     label: 'Pending' },
            { value: 'approved',    label: 'Approved' },
            { value: 'checked_out', label: 'Checked Out' },
            { value: 'returned',    label: 'Returned' },
            { value: 'rejected',    label: 'Rejected' },
          ]}
        />
      </Space>
      <Table
        dataSource={data}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ current: page, pageSize: 20, total, onChange: setPage, showSizeChanger: false }}
        size="small"
      />
    </div>
  );
}
```

- [ ] **Step 3: Verify all 4 tabs in browser**

Navigate to `/admin/clubs/:id`. Click through all tabs. Verify:
- Overview: Club Info + Admin Account cards with action buttons + Quick Stats
- Users: table with Disable/Enable and Reset Password
- Assets: table with Retire and Delete; Delete shows warning modal
- Loans: table with status filter dropdown

- [ ] **Step 4: Commit**

```bash
git add frontend/src/admin/pages/ClubDetail/tabs/AssetsTab.tsx \
        frontend/src/admin/pages/ClubDetail/tabs/LoansTab.tsx
git commit -m "feat(admin): implement assets and loans tabs in club detail"
```

---

### Task 14: Final checks + run all backend tests

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend && npx jest --no-coverage 2>&1 | tail -30
```

Expected: all tests pass (auth, clubs, assets, loans, reports, admin, etc.)

- [ ] **Step 2: TypeScript compile check — both backend and frontend**

```bash
cd backend  && npx tsc --noEmit 2>&1 | head -20
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Smoke-test full admin flow**

Start frontend dev server. Walk through:
1. `/admin/login` → login as `admin@sportstock.com`
2. Dashboard shows stats cards + club list
3. Analytics → all 4 tabs load without console errors
4. Clubs → list loads, search works
5. Click a club → Overview / Users / Assets / Loans tabs all load
6. Disable a club → login as that club's user → expect 403
7. Re-enable club → club user can login again
8. Reset a password → login with temp password → succeeds

- [ ] **Step 4: Final commit**

```bash
git add -p  # stage any remaining changes
git commit -m "feat(admin): complete admin portal — login, dashboard, analytics, club management"
```
