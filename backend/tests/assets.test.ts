import request from 'supertest';
import app from '../src/app';
import { authHeader, createClub, createUser, createAsset, deleteClub, deleteUsers } from './helpers';

const PREFIX = 't_assets_';
let clubId: string;
let adminUserId: string;
let managerUserId: string;
const adminId = `${PREFIX}admin`;
const managerId = `${PREFIX}manager`;
const coachId = `${PREFIX}coach`;

beforeAll(async () => {
  clubId = await createClub('Assets Test Club');
  const admin = await createUser(adminId, clubId, 'club_admin');
  adminUserId = admin.id;
  const manager = await createUser(managerId, clubId, 'asset_manager');
  managerUserId = manager.id;
  await createUser(coachId, clubId, 'coach');
});

afterAll(async () => {
  await deleteClub(clubId);
  await deleteUsers([adminId, managerId, coachId]);
});

describe('GET /api/v1/assets/categories', () => {
  it('returns system categories for any authenticated user', async () => {
    const res = await request(app)
      .get('/api/v1/assets/categories')
      .set(authHeader(coachId));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const systemCat = res.body.find((c: Record<string, unknown>) => c.is_system === true);
    expect(systemCat).toBeDefined();
  });
});

describe('POST /api/v1/assets/categories', () => {
  it('creates a custom category as manager', async () => {
    const res = await request(app)
      .post('/api/v1/assets/categories')
      .set(authHeader(managerId))
      .send({ name: `TestCat_${Date.now()}` });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ club_id: clubId });
  });

  it('returns 403 for coach', async () => {
    const res = await request(app)
      .post('/api/v1/assets/categories')
      .set(authHeader(coachId))
      .send({ name: 'UnauthorisedCat' });
    expect(res.status).toBe(403);
  });
});

describe('Asset CRUD', () => {
  let assetId: string;

  it('POST /assets — creates asset as manager', async () => {
    const res = await request(app)
      .post('/api/v1/assets')
      .set(authHeader(managerId))
      .send({
        name: 'Test Ball',
        total_quantity: 10,
        brand: 'Nike',
        purchase_price: 25.00,
        purchase_date: '2024-01-01',
        useful_life_years: 3,
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Test Ball',
      total_quantity: 10,
      available_quantity: 10,
      status: 'available',
      club_id: clubId,
    });
    assetId = res.body.id;
  });

  it('POST /assets — returns 403 for coach', async () => {
    const res = await request(app)
      .post('/api/v1/assets')
      .set(authHeader(coachId))
      .send({ name: 'Sneaky Ball', total_quantity: 1 });
    expect(res.status).toBe(403);
  });

  it('POST /assets — returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/v1/assets')
      .set(authHeader(managerId))
      .send({ total_quantity: 5 });
    expect(res.status).toBe(400);
  });

  it('GET /assets — returns paginated list', async () => {
    const res = await request(app)
      .get('/api/v1/assets')
      .set(authHeader(coachId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: expect.any(Array), total: expect.any(Number) });
  });

  it('GET /assets — filters by status', async () => {
    const res = await request(app)
      .get('/api/v1/assets?status=available')
      .set(authHeader(coachId));
    expect(res.status).toBe(200);
    expect(res.body.data.every((a: Record<string, unknown>) => a.status === 'available')).toBe(true);
  });

  it('GET /assets/:id — returns asset detail with recent_loans', async () => {
    const res = await request(app)
      .get(`/api/v1/assets/${assetId}`)
      .set(authHeader(coachId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: assetId, recent_loans: expect.any(Array) });
  });

  it('GET /assets/:id — returns 404 for unknown id', async () => {
    const res = await request(app)
      .get('/api/v1/assets/00000000-0000-0000-0000-000000000000')
      .set(authHeader(coachId));
    expect(res.status).toBe(404);
  });

  it('PUT /assets/:id — updates asset as manager', async () => {
    const res = await request(app)
      .put(`/api/v1/assets/${assetId}`)
      .set(authHeader(managerId))
      .send({ brand: 'Adidas', notes: 'Updated in test' });
    expect(res.status).toBe(200);
    expect(res.body.brand).toBe('Adidas');
  });

  it('GET /assets/:id/depreciation — returns depreciation data', async () => {
    const res = await request(app)
      .get(`/api/v1/assets/${assetId}/depreciation`)
      .set(authHeader(managerId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      asset_id: assetId,
      purchase_price: expect.any(String),
      net_book_value: expect.any(String),
    });
  });

  it('DELETE /assets/:id — soft-deletes asset', async () => {
    const res = await request(app)
      .delete(`/api/v1/assets/${assetId}`)
      .set(authHeader(managerId));
    expect(res.status).toBe(204);

    // Confirm it no longer appears in list
    const check = await request(app)
      .get(`/api/v1/assets/${assetId}`)
      .set(authHeader(coachId));
    expect(check.status).toBe(404);
  });
});
