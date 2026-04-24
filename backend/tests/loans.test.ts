import request from 'supertest';
import app from '../src/app';
import { authHeader, createClub, createUser, createAsset, deleteClub, deleteUsers } from './helpers';

const PREFIX = 't_loans_';
let clubId: string;
let managerId_db: string;
let coachId_db: string;
let assetId: string;
const adminId = `${PREFIX}admin`;
const managerId = `${PREFIX}manager`;
const coachId = `${PREFIX}coach`;

const tomorrow = new Date(Date.now() + 86400 * 1000).toISOString().split('T')[0];

beforeAll(async () => {
  clubId = await createClub('Loans Test Club');
  await createUser(adminId, clubId, 'club_admin');
  const mgr = await createUser(managerId, clubId, 'asset_manager');
  managerId_db = mgr.id;
  const coach = await createUser(coachId, clubId, 'coach');
  coachId_db = coach.id;
  assetId = await createAsset(clubId, managerId_db, 'Test Jersey', 10);
});

afterAll(async () => {
  await deleteClub(clubId);
  await deleteUsers([adminId, managerId, coachId]);
});

describe('Loan lifecycle', () => {
  let loanId: string;

  it('POST /loans — coach creates loan request', async () => {
    const res = await request(app)
      .post('/api/v1/loans')
      .set(authHeader(coachId))
      .send({ asset_id: assetId, quantity: 2, reason: 'Training', due_date: tomorrow });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'pending', quantity: 2, asset_id: assetId });
    loanId = res.body.id;
  });

  it('POST /loans — returns 403 when non-coach tries to create', async () => {
    const res = await request(app)
      .post('/api/v1/loans')
      .set(authHeader(managerId))
      .send({ asset_id: assetId, quantity: 1, due_date: tomorrow });
    expect(res.status).toBe(403);
  });

  it('GET /loans — admin sees all loans', async () => {
    const res = await request(app)
      .get('/api/v1/loans')
      .set(authHeader(adminId));
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  it('GET /loans — coach sees only own loans', async () => {
    const res = await request(app)
      .get('/api/v1/loans')
      .set(authHeader(coachId));
    expect(res.status).toBe(200);
    expect(res.body.data.every((l: Record<string, unknown>) => l.coach_id === coachId_db)).toBe(true);
  });

  it('GET /loans/:id — returns loan detail', async () => {
    const res = await request(app)
      .get(`/api/v1/loans/${loanId}`)
      .set(authHeader(managerId));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(loanId);
  });

  it('POST /loans/:id/approve — manager approves loan', async () => {
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/approve`)
      .set(authHeader(managerId));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
  });

  it('POST /loans/:id/approve — returns 409 if not pending', async () => {
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/approve`)
      .set(authHeader(managerId));
    expect(res.status).toBe(409);
  });

  it('POST /loans/:id/checkout — manager checks out loan', async () => {
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/checkout`)
      .set(authHeader(managerId));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('checked_out');
  });

  it('POST /loans/:id/initiate-return — coach initiates return', async () => {
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/initiate-return`)
      .set(authHeader(coachId));
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Return initiated');
  });

  it('POST /loans/:id/return — manager confirms return (good condition)', async () => {
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/return`)
      .set(authHeader(managerId))
      .send({ condition: 'good', notes: 'All good' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('returned');
    expect(res.body.return_condition).toBe('good');
  });
});

describe('Loan rejection flow', () => {
  let loanId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/loans')
      .set(authHeader(coachId))
      .send({ asset_id: assetId, quantity: 1, due_date: tomorrow });
    loanId = res.body.id;
  });

  it('POST /loans/:id/reject — manager rejects with reason', async () => {
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/reject`)
      .set(authHeader(managerId))
      .send({ reason: 'Not enough stock' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('rejected');
    expect(res.body.rejection_reason).toBe('Not enough stock');
  });
});

describe('Loan input validation', () => {
  it('POST /loans — returns 400 when due_date is missing', async () => {
    const res = await request(app)
      .post('/api/v1/loans')
      .set(authHeader(coachId))
      .send({ asset_id: assetId, quantity: 1 });
    expect(res.status).toBe(400);
  });

  it('POST /loans — returns 400 when due_date is in the past', async () => {
    const res = await request(app)
      .post('/api/v1/loans')
      .set(authHeader(coachId))
      .send({ asset_id: assetId, quantity: 1, due_date: '2020-01-01' });
    expect(res.status).toBe(400);
  });

  it('POST /loans — returns 404 for unknown asset', async () => {
    const res = await request(app)
      .post('/api/v1/loans')
      .set(authHeader(coachId))
      .send({ asset_id: '00000000-0000-0000-0000-000000000000', quantity: 1, due_date: tomorrow });
    expect(res.status).toBe(404);
  });
});
