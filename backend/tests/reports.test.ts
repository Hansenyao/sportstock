import request from 'supertest';
import app from '../src/app';
import { authHeader, createClub, createUser, createAsset, deleteClub, deleteUsers } from './helpers';

const PREFIX = 't_rpt_';
let clubId: string;
let managerId_db: string;
const adminId = `${PREFIX}admin`;
const managerId = `${PREFIX}manager`;
const coachId = `${PREFIX}coach`;

beforeAll(async () => {
  clubId = await createClub('Reports Test Club');
  await createUser(adminId, clubId, 'club_admin');
  const mgr = await createUser(managerId, clubId, 'asset_manager');
  managerId_db = mgr.id;
  await createUser(coachId, clubId, 'coach');
  await createAsset(clubId, managerId_db, 'Report Test Ball', 5);
});

afterAll(async () => {
  await deleteClub(clubId);
  await deleteUsers([adminId, managerId, coachId]);
});

describe('GET /api/v1/reports/summary', () => {
  it('returns asset summary for manager', async () => {
    const res = await request(app)
      .get('/api/v1/reports/summary')
      .set(authHeader(managerId));
    expect(res.status).toBe(200);
    // Counts come back as strings from pg COUNT()
    expect(res.body).toMatchObject({
      total_assets: expect.anything(),
      total_items: expect.anything(),
      available_items: expect.anything(),
    });
  });

  it('returns 403 for coach', async () => {
    const res = await request(app)
      .get('/api/v1/reports/summary')
      .set(authHeader(coachId));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/reports/depreciation', () => {
  it('returns depreciation report with items and summary', async () => {
    const res = await request(app)
      .get('/api/v1/reports/depreciation')
      .set(authHeader(managerId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      items: expect.any(Array),
      summary: expect.objectContaining({
        total_assets_with_depreciation: expect.any(Number),
      }),
    });
  });
});

describe('GET /api/v1/reports/loan-usage', () => {
  it('returns loan usage report', async () => {
    const res = await request(app)
      .get('/api/v1/reports/loan-usage')
      .set(authHeader(managerId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      top_assets: expect.any(Array),
      monthly_trend: expect.any(Array),
    });
  });
});

describe('GET /api/v1/reports/movements', () => {
  it('returns stock movement totals', async () => {
    const res = await request(app)
      .get('/api/v1/reports/movements')
      .set(authHeader(managerId));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
