import request from 'supertest';
import app from '../src/app';
import { authHeader, createClub, createUser, createAsset, deleteClub, deleteUsers } from './helpers';

const PREFIX = 't_rpt_';
const adminEmail   = `${PREFIX}admin@test.com`;
const managerEmail = `${PREFIX}manager@test.com`;
const coachEmail   = `${PREFIX}coach@test.com`;
let clubId: string;
let adminUserId: string;
let managerUserId: string;
let coachUserId: string;

beforeAll(async () => {
  clubId = await createClub('Reports Test Club');
  const admin = await createUser(adminEmail, clubId, 'club_admin');
  adminUserId = admin.id;
  const mgr = await createUser(managerEmail, clubId, 'asset_manager');
  managerUserId = mgr.id;
  const coach = await createUser(coachEmail, clubId, 'coach');
  coachUserId = coach.id;
  await createAsset(clubId, managerUserId, 'Report Test Ball', 5); // eslint-disable-line @typescript-eslint/no-unused-vars
});

afterAll(async () => {
  await deleteClub(clubId);
  await deleteUsers([adminEmail, managerEmail, coachEmail]);
});

describe('GET /api/v1/reports/summary', () => {
  it('returns asset summary for manager', async () => {
    const res = await request(app)
      .get('/api/v1/reports/summary')
      .set(authHeader(managerUserId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total_assets: expect.anything(),
      total_items: expect.anything(),
      available_items: expect.anything(),
    });
  });

  it('returns 403 for coach', async () => {
    const res = await request(app)
      .get('/api/v1/reports/summary')
      .set(authHeader(coachUserId));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/reports/depreciation', () => {
  it('returns depreciation report with items and summary', async () => {
    const res = await request(app)
      .get('/api/v1/reports/depreciation')
      .set(authHeader(managerUserId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      items: expect.any(Array),
      summary: expect.objectContaining({
        total_batches_with_depreciation: expect.anything(),
      }),
    });
  });
});

describe('GET /api/v1/reports/loan-usage', () => {
  it('returns loan usage report', async () => {
    const res = await request(app)
      .get('/api/v1/reports/loan-usage')
      .set(authHeader(managerUserId));
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
      .set(authHeader(managerUserId));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
