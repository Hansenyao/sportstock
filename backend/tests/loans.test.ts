import request from 'supertest';
import app from '../src/app';
import { authHeader, createClub, createUser, createAsset, deleteClub, deleteUsers } from './helpers';

const PREFIX = 't_loans_';
const adminEmail   = `${PREFIX}admin@test.com`;
const managerEmail = `${PREFIX}manager@test.com`;
const coachEmail   = `${PREFIX}coach@test.com`;
let clubId: string;
let adminUserId: string;
let managerUserId: string;
let coachUserId: string;
let assetTypeId: string;

const tomorrow = new Date(Date.now() + 86400 * 1000).toISOString().split('T')[0];

beforeAll(async () => {
  clubId = await createClub('Loans Test Club');
  const admin = await createUser(adminEmail, clubId, 'club_admin');
  adminUserId = admin.id;
  const mgr = await createUser(managerEmail, clubId, 'asset_manager');
  managerUserId = mgr.id;
  const coach = await createUser(coachEmail, clubId, 'coach');
  coachUserId = coach.id;
  const asset = await createAsset(clubId, managerUserId, 'Test Jersey', 10);
  assetTypeId = asset.typeId;
});

afterAll(async () => {
  await deleteClub(clubId);
  await deleteUsers([adminEmail, managerEmail, coachEmail]);
});

describe('Loan lifecycle', () => {
  let loanId: string;

  it('POST /loans — coach creates loan request', async () => {
    const res = await request(app)
      .post('/api/v1/loans')
      .set(authHeader(coachUserId))
      .send({
        items: [{ asset_type_id: assetTypeId, quantity: 2 }],
        reason: 'Training',
        due_date: tomorrow,
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'pending', items: expect.any(Array) });
    expect(res.body.items[0]).toMatchObject({ asset_type_id: assetTypeId, quantity: 2 });
    loanId = res.body.id;
  });

  it('POST /loans — returns 400 when manager creates without coach_id', async () => {
    // Managers can create loans on behalf of coaches but must supply coach_id
    const res = await request(app)
      .post('/api/v1/loans')
      .set(authHeader(managerUserId))
      .send({
        items: [{ asset_type_id: assetTypeId, quantity: 1 }],
        due_date: tomorrow,
      });
    expect(res.status).toBe(400);
  });

  it('GET /loans — admin sees all loans', async () => {
    const res = await request(app)
      .get('/api/v1/loans')
      .set(authHeader(adminUserId));
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  it('GET /loans — coach sees only own loans', async () => {
    const res = await request(app)
      .get('/api/v1/loans')
      .set(authHeader(coachUserId));
    expect(res.status).toBe(200);
    expect(res.body.data.every((l: Record<string, unknown>) => l.coach_id === coachUserId)).toBe(true);
  });

  it('GET /loans/:id — returns loan detail', async () => {
    const res = await request(app)
      .get(`/api/v1/loans/${loanId}`)
      .set(authHeader(managerUserId));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(loanId);
  });

  it('POST /loans/:id/approve — manager approves loan', async () => {
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/approve`)
      .set(authHeader(managerUserId));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
  });

  it('POST /loans/:id/approve — returns 409 if not pending', async () => {
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/approve`)
      .set(authHeader(managerUserId));
    expect(res.status).toBe(409);
  });

  it('POST /loans/:id/checkout — coach confirms receipt', async () => {
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/checkout`)
      .set(authHeader(coachUserId));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('checked_out');
  });

  it('POST /loans/:id/return — manager confirms return (good condition)', async () => {
    // Fetch loan to get loan_item_ids
    const detail = await request(app)
      .get(`/api/v1/loans/${loanId}`)
      .set(authHeader(managerUserId));
    const items = detail.body.items as Array<{ id: string; quantity: number }>;
    const returnItems = items.map(item => ({
      loan_item_id:          item.id,
      good_quantity:         item.quantity,
      minor_damage_quantity: 0,
      write_off_quantity:    0,
      lost_quantity:         0,
    }));

    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/return`)
      .set(authHeader(managerUserId))
      .send({ items: returnItems, notes: 'All good' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('returned');
  });
});

describe('Loan rejection flow', () => {
  let loanId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/loans')
      .set(authHeader(coachUserId))
      .send({
        items: [{ asset_type_id: assetTypeId, quantity: 1 }],
        due_date: tomorrow,
      });
    loanId = res.body.id;
  });

  it('POST /loans/:id/reject — manager rejects with reason', async () => {
    const res = await request(app)
      .post(`/api/v1/loans/${loanId}/reject`)
      .set(authHeader(managerUserId))
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
      .set(authHeader(coachUserId))
      .send({ items: [{ asset_type_id: assetTypeId, quantity: 1 }] });
    expect(res.status).toBe(400);
  });

  it('POST /loans — returns 400 when due_date is in the past', async () => {
    const res = await request(app)
      .post('/api/v1/loans')
      .set(authHeader(coachUserId))
      .send({ items: [{ asset_type_id: assetTypeId, quantity: 1 }], due_date: '2020-01-01' });
    expect(res.status).toBe(400);
  });

  it('POST /loans — returns 404 for unknown asset type', async () => {
    const res = await request(app)
      .post('/api/v1/loans')
      .set(authHeader(coachUserId))
      .send({
        items: [{ asset_type_id: '00000000-0000-0000-0000-000000000000', quantity: 1 }],
        due_date: tomorrow,
      });
    expect(res.status).toBe(404);
  });
});
