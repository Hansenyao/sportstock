import request from 'supertest';
import app from '../src/app';
import { query } from '../src/db';
import { authHeader, createClub, createUser, createAsset, deleteClub, deleteUsers } from './helpers';

const PREFIX = 't_inv_';
const adminEmail   = `${PREFIX}admin@test.com`;
const managerEmail = `${PREFIX}manager@test.com`;
const coachEmail   = `${PREFIX}coach@test.com`;
let clubId: string;
let adminUserId: string;
let managerUserId: string;
let coachUserId: string;
let assetId: string;

beforeAll(async () => {
  clubId = await createClub('Inventory Test Club');
  const admin = await createUser(adminEmail, clubId, 'club_admin');
  adminUserId = admin.id;
  const mgr = await createUser(managerEmail, clubId, 'asset_manager');
  managerUserId = mgr.id;
  const coach = await createUser(coachEmail, clubId, 'coach');
  coachUserId = coach.id;
  assetId = await createAsset(clubId, managerUserId, 'Inventory Ball', 10);
});

afterAll(async () => {
  await deleteClub(clubId);
  await deleteUsers([adminEmail, managerEmail, coachEmail]);
});

describe('GET /api/v1/inventory/movements', () => {
  it('returns paginated movement history', async () => {
    const res = await request(app)
      .get('/api/v1/inventory/movements')
      .set(authHeader(managerUserId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: expect.any(Array), total: expect.any(Number) });
  });

  it('returns 403 for coach', async () => {
    const res = await request(app)
      .get('/api/v1/inventory/movements')
      .set(authHeader(coachUserId));
    expect(res.status).toBe(403);
  });

  it('filters by asset_id', async () => {
    const res = await request(app)
      .get(`/api/v1/inventory/movements?asset_id=${assetId}`)
      .set(authHeader(managerUserId));
    expect(res.status).toBe(200);
    expect(res.body.data.every((m: Record<string, unknown>) => m.asset_id === assetId)).toBe(true);
  });
});

describe('POST /api/v1/inventory/purchase', () => {
  it('adds stock to an asset', async () => {
    const res = await request(app)
      .post('/api/v1/inventory/purchase')
      .set(authHeader(managerUserId))
      .send({ asset_id: assetId, quantity: 5, notes: 'Restocked' });
    expect(res.status).toBe(200);
    expect(Number(res.body.available_quantity)).toBeGreaterThanOrEqual(15);
  });

  it('returns 400 for zero quantity', async () => {
    const res = await request(app)
      .post('/api/v1/inventory/purchase')
      .set(authHeader(managerUserId))
      .send({ asset_id: assetId, quantity: 0 });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/inventory/adjust', () => {
  it('adjusts stock by delta', async () => {
    const before = await request(app)
      .get(`/api/v1/assets/${assetId}`)
      .set(authHeader(managerUserId));
    const prevQty = Number(before.body.available_quantity);

    const res = await request(app)
      .post('/api/v1/inventory/adjust')
      .set(authHeader(managerUserId))
      .send({ asset_id: assetId, quantity_delta: -2, notes: 'Lost items' });
    expect(res.status).toBe(200);
    expect(Number(res.body.available_quantity)).toBe(prevQty - 2);
  });
});

describe('Stocktake sessions', () => {
  let sessionId: string;

  it('POST /inventory/stocktake — creates new session', async () => {
    const res = await request(app)
      .post('/api/v1/inventory/stocktake')
      .set(authHeader(managerUserId))
      .send({ notes: 'Monthly count' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('in_progress');
    sessionId = res.body.id;
  });

  it('GET /inventory/stocktake — lists sessions', async () => {
    const res = await request(app)
      .get('/api/v1/inventory/stocktake')
      .set(authHeader(managerUserId));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /inventory/stocktake/:id — returns session with items', async () => {
    const res = await request(app)
      .get(`/api/v1/inventory/stocktake/${sessionId}`)
      .set(authHeader(managerUserId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: sessionId, items: expect.any(Array) });
  });

  it('PUT /inventory/stocktake/:id — records counts and completes session', async () => {
    const res = await request(app)
      .put(`/api/v1/inventory/stocktake/${sessionId}`)
      .set(authHeader(managerUserId))
      .send({
        items: [{ asset_id: assetId, physical_quantity: 8, notes: 'Found 8' }],
        status: 'completed',
      });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
  });

  afterAll(async () => {
    if (sessionId) {
      await query('DELETE FROM stocktake_sessions WHERE id = $1', [sessionId]);
    }
  });
});
