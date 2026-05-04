import request from 'supertest';
import app from '../src/app';
import { authHeader, createClub, createUser, createAsset, deleteClub, deleteUsers } from './helpers';
import { query as dbQuery } from '../src/db';

const PREFIX = 't_rpt_';
const adminEmail   = `${PREFIX}admin@test.com`;
const managerEmail = `${PREFIX}manager@test.com`;
const coachEmail   = `${PREFIX}coach@test.com`;
let clubId: string;
let adminUserId: string;
let managerUserId: string;
let coachUserId: string;
let teamId: string;
let loanId: string; // cascade-deleted with club; reserved for future loan-specific assertions

beforeAll(async () => {
  clubId = await createClub('Reports Test Club');
  const admin = await createUser(adminEmail, clubId, 'club_admin');
  adminUserId = admin.id;
  const mgr = await createUser(managerEmail, clubId, 'asset_manager');
  managerUserId = mgr.id;
  const coach = await createUser(coachEmail, clubId, 'coach');
  coachUserId = coach.id;
  await createAsset(clubId, managerUserId, 'Report Test Ball', 5); // eslint-disable-line @typescript-eslint/no-unused-vars

  // Create a team for the team-filter tests
  const { rows: [team] } = await dbQuery<{ id: string }>(
    `INSERT INTO teams (club_id, name, gender, age_group)
     VALUES ($1, 'Reports Team', 'Boys', 'U12') RETURNING id`,
    [clubId]
  );
  teamId = team.id;

  // Create a checked-out loan belonging to that team
  const { rows: [loan] } = await dbQuery<{ id: string }>(
    `INSERT INTO loans (club_id, coach_id, team_id, status, due_date, created_by)
     VALUES ($1, $2, $3, 'checked_out', CURRENT_DATE + INTERVAL '7 days', $2) RETURNING id`,
    [clubId, coachUserId, teamId]
  );
  loanId = loan.id;
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

describe('GET /api/v1/reports/summary — enhanced fields', () => {
  it('returns status-breakdown counts', async () => {
    const res = await request(app)
      .get('/api/v1/reports/summary')
      .set(authHeader(managerUserId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      active_total:    expect.any(Number),
      available_qty:   expect.any(Number),
      on_loan_qty:     expect.any(Number),
      maintenance_qty: expect.any(Number),
      retired_qty:     expect.any(Number),
    });
    // active_total must be non-negative and >= available_qty
    expect(res.body.active_total).toBeGreaterThanOrEqual(0);
    expect(res.body.active_total).toBeGreaterThanOrEqual(res.body.available_qty);
  });

  it('returns category_breakdown array with correct shape', async () => {
    const res = await request(app)
      .get('/api/v1/reports/summary')
      .set(authHeader(managerUserId));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.category_breakdown)).toBe(true);
    if (res.body.category_breakdown.length > 0) {
      expect(res.body.category_breakdown[0]).toMatchObject({
        category_name: expect.any(String),
        total_qty:     expect.any(Number),
        available_qty: expect.any(Number),
      });
    }
  });

  it('existing fields are still present', async () => {
    const res = await request(app)
      .get('/api/v1/reports/summary')
      .set(authHeader(managerUserId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total_assets:        expect.anything(),
      total_items:         expect.anything(),
      available_items:     expect.anything(),
      total_purchase_value: expect.anything(),
    });
  });
});

describe('GET /api/v1/reports/alerts', () => {
  // Asset with 100% life elapsed (purchase 2019-01-01, 5-year life)
  let retirementBatchId: string;
  // Asset type with available_qty=1, club default low_stock_threshold=2 → low stock
  let lowStockTypeId: string;

  beforeAll(async () => {
    // Asset type 1: retirement-risk only
    const { rows: retireNameRows } = await dbQuery<{ id: string }>(
      `INSERT INTO asset_names (club_id, name) VALUES ($1, 'Alert Retire Ball') RETURNING id`,
      [clubId]
    );
    const { rows: retireTypeRows } = await dbQuery<{ id: string }>(
      `INSERT INTO asset_types (club_id, asset_name_id) VALUES ($1, $2) RETURNING id`,
      [clubId, retireNameRows[0].id]
    );
    const retireTypeId = retireTypeRows[0].id;

    // Retirement-risk batch: 2019-01-01 start, 5-year life → ~146% elapsed
    const { rows: batchRows } = await dbQuery<{ id: string }>(
      `INSERT INTO asset_batches
         (asset_type_id, total_quantity, available_quantity, status,
          purchase_date, purchase_price, useful_life_years)
       VALUES ($1, 5, 5, 'available', '2019-01-01', 100.00, 5) RETURNING id`,
      [retireTypeId]
    );
    retirementBatchId = batchRows[0].id;

    // Asset type 2: low-stock only (no retirement-risk batch)
    const { rows: stockNameRows } = await dbQuery<{ id: string }>(
      `INSERT INTO asset_names (club_id, name) VALUES ($1, 'Alert Stock Ball') RETURNING id`,
      [clubId]
    );
    const { rows: stockTypeRows } = await dbQuery<{ id: string }>(
      `INSERT INTO asset_types (club_id, asset_name_id) VALUES ($1, $2) RETURNING id`,
      [clubId, stockNameRows[0].id]
    );
    lowStockTypeId = stockTypeRows[0].id;

    // Low-stock batch: available_quantity=1, club default threshold=2
    await dbQuery(
      `INSERT INTO asset_batches
         (asset_type_id, total_quantity, available_quantity, status,
          purchase_date, purchase_price, useful_life_years)
       VALUES ($1, 10, 1, 'available', '2024-01-01', 20.00, 3)`,
      [lowStockTypeId]
    );
  });

  it('returns retirement_risk and low_stock arrays with total_alert_count', async () => {
    const res = await request(app)
      .get('/api/v1/reports/alerts')
      .set(authHeader(managerUserId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      retirement_risk:   expect.any(Array),
      low_stock:         expect.any(Array),
      total_alert_count: expect.any(Number),
    });
  });

  it('retirement_risk includes the near-expiry batch', async () => {
    const res = await request(app)
      .get('/api/v1/reports/alerts')
      .set(authHeader(managerUserId));
    expect(res.status).toBe(200);
    const found = res.body.retirement_risk.find(
      (r: { batch_id: string }) => r.batch_id === retirementBatchId
    );
    expect(found).toBeDefined();
    expect(found.life_used_percent).toBeGreaterThanOrEqual(80);
  });

  it('retirement_risk items have required fields', async () => {
    const res = await request(app)
      .get('/api/v1/reports/alerts')
      .set(authHeader(managerUserId));
    if (res.body.retirement_risk.length > 0) {
      expect(res.body.retirement_risk[0]).toMatchObject({
        batch_id:          expect.any(String),
        asset_name:        expect.any(String),
        purchase_date:     expect.any(String),
        useful_life_years: expect.any(Number),
        total_quantity:    expect.any(Number),
        life_used_percent: expect.any(Number),
      });
    }
  });

  it('low_stock includes the asset type with available_qty below threshold', async () => {
    const res = await request(app)
      .get('/api/v1/reports/alerts')
      .set(authHeader(managerUserId));
    expect(res.status).toBe(200);
    const found = res.body.low_stock.find(
      (r: { asset_type_id: string }) => r.asset_type_id === lowStockTypeId
    );
    expect(found).toBeDefined();
    expect(Number(found.available_qty)).toBeLessThanOrEqual(Number(found.effective_threshold));
  });

  it('total_alert_count equals sum of both arrays', async () => {
    const res = await request(app)
      .get('/api/v1/reports/alerts')
      .set(authHeader(managerUserId));
    expect(res.body.total_alert_count).toBe(
      res.body.retirement_risk.length + res.body.low_stock.length
    );
  });

  it('returns 403 for coach', async () => {
    const res = await request(app)
      .get('/api/v1/reports/alerts')
      .set(authHeader(coachUserId));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/reports/movements/recent', () => {
  beforeAll(async () => {
    const { rows: batchRows } = await dbQuery<{ id: string }>(
      `SELECT ab.id FROM asset_batches ab
       JOIN asset_types at ON at.id = ab.asset_type_id
       WHERE at.club_id = $1 LIMIT 1`,
      [clubId]
    );
    if (batchRows.length > 0) {
      await dbQuery(
        `INSERT INTO stock_movements
           (club_id, asset_batch_id, type, quantity_delta, quantity_before, quantity_after)
         VALUES ($1, $2, 'purchase', 5, 0, 5)`,
        [clubId, batchRows[0].id]
      );
    }
  });

  it('returns array of up to 10 recent movements with required fields', async () => {
    const res = await request(app)
      .get('/api/v1/reports/movements/recent')
      .set(authHeader(managerUserId));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.length).toBeLessThanOrEqual(10);
    expect(res.body[0]).toMatchObject({
      id:              expect.any(String),
      asset_type_name: expect.any(String),
      type:            expect.any(String),
      quantity_delta:  expect.any(Number),
      created_at:      expect.any(String),
    });
  });

  it('returns 403 for coach', async () => {
    const res = await request(app)
      .get('/api/v1/reports/movements/recent')
      .set(authHeader(coachUserId));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/reports/loan-usage?team_id', () => {
  it('returns team_summary when team_id is provided', async () => {
    const res = await request(app)
      .get(`/api/v1/reports/loan-usage?team_id=${teamId}`)
      .set(authHeader(managerUserId));
    expect(res.status).toBe(200);
    expect(res.body.team_summary).toMatchObject({
      id: teamId,
      name: 'Reports Team',
      total_loans: expect.any(Number),
      active_loans: expect.any(Number),
      overdue_loans: expect.any(Number),
    });
    expect(Number(res.body.team_summary.total_loans)).toBeGreaterThanOrEqual(1);
    expect(Number(res.body.team_summary.active_loans)).toBeGreaterThanOrEqual(1);
  });

  it('returns null team_summary when team_id is not provided', async () => {
    const res = await request(app)
      .get('/api/v1/reports/loan-usage')
      .set(authHeader(managerUserId));
    expect(res.status).toBe(200);
    expect(res.body.team_summary).toBeNull();
  });
});
