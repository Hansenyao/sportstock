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
        user_count:         expect.any(Number),
        asset_count:        expect.any(Number),
        active_loan_count:  expect.any(Number),
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
