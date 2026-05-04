# Analytics Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 3 new report endpoints and extend the club settings API to support the asset analytics feature.

**Architecture:** Extend `report.service.ts` with 3 functions (enhanced `getSummary`, new `getAlerts`, new `getRecentMovements`), wire them through the existing controller/routes pattern, and extend `club.service.ts` to persist the two new retirement-alert columns. DB re-initialized from `db-init.sql` — no migration.

**Tech Stack:** Node.js / Express / TypeScript, PostgreSQL, Jest + Supertest

---

## File Map

| File | Change |
|------|--------|
| `backend/db-init.sql` | Add `retirement_alert_mode` + `retirement_alert_value` to `CREATE TABLE clubs` |
| `backend/src/services/report.service.ts` | Enhance `getSummary`; add `getAlerts`; add `getRecentMovements` |
| `backend/src/controllers/report.controller.ts` | Add `getAlerts` and `getRecentMovements` handlers |
| `backend/src/routes/reports.ts` | Register `GET /alerts` and `GET /movements/recent` |
| `backend/src/services/club.service.ts` | Extend `updateClub` to accept `retirement_alert_mode` + `retirement_alert_value` |
| `backend/tests/reports.test.ts` | Add tests for enhanced summary and two new endpoints |
| `backend/tests/clubs.test.ts` | Add test for new club settings fields |

---

## Task 1: Update DB Schema

**Files:**
- Modify: `backend/db-init.sql`

- [ ] **Step 1: Add two columns to the clubs table definition**

Find the `CREATE TABLE clubs (` block (line ~122) and add before the closing `);`:

```sql
    -- analytics alert configuration
    retirement_alert_mode  VARCHAR(10) NOT NULL DEFAULT 'percent'
      CHECK (retirement_alert_mode IN ('months', 'percent')),
    retirement_alert_value INT         NOT NULL DEFAULT 80,
```

The full block after the edit ends with:

```sql
CREATE TABLE clubs (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(255) NOT NULL,
    sport_type          VARCHAR(100),
    address             TEXT,
    contact_email       VARCHAR(255),
    logo_url            TEXT,
    low_stock_threshold INT         NOT NULL DEFAULT 2,
    retirement_alert_mode  VARCHAR(10) NOT NULL DEFAULT 'percent'
      CHECK (retirement_alert_mode IN ('months', 'percent')),
    retirement_alert_value INT         NOT NULL DEFAULT 80,
    is_active           BOOLEAN     NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 2: Re-initialize the database**

```bash
cd backend
psql $DATABASE_URL -f db-init.sql
```

Expected: several `DROP`, `CREATE`, `INSERT` lines with no ERROR output.

- [ ] **Step 3: Verify new columns exist**

```bash
psql $DATABASE_URL -c "\d clubs" | grep retirement
```

Expected output contains:
```
retirement_alert_mode  | character varying(10) | not null default 'percent'
retirement_alert_value | integer               | not null default 80
```

- [ ] **Step 4: Commit**

```bash
git add backend/db-init.sql
git commit -m "feat(db): add retirement alert config columns to clubs table"
```

---

## Task 2: Enhance GET /reports/summary

Add status-breakdown counts and per-category data to the existing summary endpoint.

**Files:**
- Modify: `backend/src/services/report.service.ts`
- Modify: `backend/tests/reports.test.ts`

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block to `backend/tests/reports.test.ts` (after the existing summary describe block):

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx jest --testPathPattern=reports --runInBand 2>&1 | tail -20
```

Expected: 2 of the new tests FAIL with `expect received undefined`.

- [ ] **Step 3: Implement the enhanced getSummary**

Replace the `getSummary` function in `backend/src/services/report.service.ts`:

```typescript
export async function getSummary(clubId: string): Promise<Record<string, unknown>> {
  const [{ rows: assetRows }, { rows: loanRows }, { rows: categoryRows }] = await Promise.all([
    db.query<Record<string, unknown>>(
      `SELECT
         COUNT(DISTINCT at.id)                                                            AS total_assets,
         COALESCE(SUM(ab.total_quantity)     FILTER (WHERE at.is_active = true), 0)      AS total_items,
         COALESCE(SUM(ab.available_quantity) FILTER (WHERE at.is_active = true), 0)      AS available_items,
         COALESCE(
           SUM(ab.purchase_price * ab.total_quantity)
           FILTER (WHERE at.is_active = true AND ab.purchase_price IS NOT NULL), 0
         )                                                                                AS total_purchase_value,
         COALESCE(SUM(ab.total_quantity)
           FILTER (WHERE at.is_active = true AND ab.status != 'retired'), 0)             AS active_total,
         COALESCE(SUM(ab.available_quantity)
           FILTER (WHERE at.is_active = true AND ab.status != 'retired'), 0)             AS available_qty,
         COALESCE(SUM(ab.total_quantity)
           FILTER (WHERE at.is_active = true AND ab.status = 'on_loan'), 0)              AS on_loan_qty,
         COALESCE(SUM(ab.total_quantity)
           FILTER (WHERE at.is_active = true AND ab.status = 'maintenance'), 0)          AS maintenance_qty,
         COALESCE(SUM(ab.total_quantity)
           FILTER (WHERE at.is_active = true AND ab.status = 'retired'), 0)              AS retired_qty
       FROM asset_types at
       LEFT JOIN asset_batches ab ON ab.asset_type_id = at.id
       WHERE at.club_id = $1`,
      [clubId]
    ),
    db.query<Record<string, unknown>>(
      `SELECT
         COUNT(*)                                         AS active_loans,
         COUNT(*) FILTER (WHERE due_date < CURRENT_DATE) AS overdue_loans
       FROM loans WHERE club_id = $1 AND status = 'checked_out'`,
      [clubId]
    ),
    db.query<Record<string, unknown>>(
      `SELECT
         COALESCE(ac.name, 'Uncategorized')               AS category_name,
         COALESCE(SUM(ab.total_quantity)
           FILTER (WHERE ab.status != 'retired'), 0)      AS total_qty,
         COALESCE(SUM(ab.available_quantity)
           FILTER (WHERE ab.status != 'retired'), 0)      AS available_qty
       FROM asset_types at
       JOIN asset_names an ON an.id = at.asset_name_id
       LEFT JOIN asset_categories ac ON ac.id = an.category_id
       LEFT JOIN asset_batches ab ON ab.asset_type_id = at.id
       WHERE at.club_id = $1 AND at.is_active = true
       GROUP BY ac.id, ac.name
       ORDER BY total_qty DESC`,
      [clubId]
    ),
  ]);

  return {
    ...assetRows[0],
    ...loanRows[0],
    category_breakdown: categoryRows,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest --testPathPattern=reports --runInBand 2>&1 | tail -20
```

Expected: all report tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/report.service.ts backend/tests/reports.test.ts
git commit -m "feat(reports): enhance summary with status counts and category breakdown"
```

---

## Task 3: Add GET /reports/alerts

New endpoint returning retirement-risk batches and low-stock asset types, using the club's configured thresholds.

**Files:**
- Modify: `backend/src/services/report.service.ts`
- Modify: `backend/src/controllers/report.controller.ts`
- Modify: `backend/src/routes/reports.ts`
- Modify: `backend/tests/reports.test.ts`

- [ ] **Step 1: Write the failing tests**

First, add a static DB import at the top of `backend/tests/reports.test.ts` (after the existing imports):

```typescript
import { query as dbQuery } from '../src/db';
```

Then append the following `describe` block to the file. The inner `beforeAll` inserts specific test data; cleanup is handled by the outer-scope `afterAll(() => deleteClub(clubId))` which cascade-deletes everything.

```typescript
describe('GET /api/v1/reports/alerts', () => {
  // Asset with 100% life elapsed (purchase 2019-01-01, 5-year life)
  let retirementBatchId: string;
  // Asset type with available_qty=1, club default low_stock_threshold=2 → low stock
  let lowStockTypeId: string;

  beforeAll(async () => {
    const { rows: nameRows } = await dbQuery<{ id: string }>(
      `INSERT INTO asset_names (club_id, name) VALUES ($1, 'Alert Test Ball') RETURNING id`,
      [clubId]
    );
    const nameId = nameRows[0].id;

    const { rows: typeRows } = await dbQuery<{ id: string }>(
      `INSERT INTO asset_types (club_id, asset_name_id) VALUES ($1, $2) RETURNING id`,
      [clubId, nameId]
    );
    const typeId = typeRows[0].id;
    lowStockTypeId = typeId;

    // Retirement-risk batch: 2019-01-01 start, 5-year life → ~146% elapsed
    const { rows: batchRows } = await dbQuery<{ id: string }>(
      `INSERT INTO asset_batches
         (asset_type_id, total_quantity, available_quantity, status,
          purchase_date, purchase_price, useful_life_years)
       VALUES ($1, 5, 5, 'available', '2019-01-01', 100.00, 5) RETURNING id`,
      [typeId]
    );
    retirementBatchId = batchRows[0].id;

    // Low-stock batch: available_quantity=1, club default threshold=2
    await dbQuery(
      `INSERT INTO asset_batches
         (asset_type_id, total_quantity, available_quantity, status,
          purchase_date, purchase_price, useful_life_years)
       VALUES ($1, 10, 1, 'available', '2024-01-01', 20.00, 3)`,
      [typeId]
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx jest --testPathPattern=reports --runInBand 2>&1 | grep -E "FAIL|PASS|✓|✗|×|●" | head -20
```

Expected: new tests FAIL with 404 (route not registered yet).

- [ ] **Step 3: Add getAlerts to report.service.ts**

Append to `backend/src/services/report.service.ts`:

```typescript
export async function getAlerts(clubId: string): Promise<{
  retirement_risk: Record<string, unknown>[];
  low_stock: Record<string, unknown>[];
  total_alert_count: number;
}> {
  const [{ rows: retirementRows }, { rows: lowStockRows }] = await Promise.all([
    db.query<Record<string, unknown>>(
      `SELECT
         ab.id                AS batch_id,
         an.name              AS asset_name,
         at.brand, at.model, at.size,
         ab.purchase_date,
         ab.useful_life_years,
         ab.total_quantity,
         ab.status            AS batch_status,
         ROUND(
           EXTRACT(EPOCH FROM (NOW() - ab.purchase_date))
           / (ab.useful_life_years * 365.25 * 86400) * 100
         )::int               AS life_used_percent
       FROM asset_batches ab
       JOIN asset_types at ON at.id = ab.asset_type_id
       JOIN asset_names  an ON an.id = at.asset_name_id
       JOIN clubs         c  ON c.id  = at.club_id
       WHERE at.club_id = $1
         AND at.is_active = true
         AND ab.status    != 'retired'
         AND ab.purchase_date     IS NOT NULL
         AND ab.useful_life_years IS NOT NULL
         AND (
           CASE
             WHEN c.retirement_alert_mode = 'percent' THEN
               EXTRACT(EPOCH FROM (NOW() - ab.purchase_date))
               / (ab.useful_life_years * 365.25 * 86400) * 100
               >= c.retirement_alert_value
             ELSE
               ab.useful_life_years * 12
               - EXTRACT(EPOCH FROM (NOW() - ab.purchase_date)) / (30.4375 * 86400)
               <= c.retirement_alert_value
           END
         )
       ORDER BY life_used_percent DESC`,
      [clubId]
    ),
    db.query<Record<string, unknown>>(
      `SELECT
         at.id                                                          AS asset_type_id,
         an.name                                                        AS asset_name,
         at.brand, at.model, at.size,
         COALESCE(SUM(ab.total_quantity)     FILTER (WHERE ab.status != 'retired'), 0) AS total_qty,
         COALESCE(SUM(ab.available_quantity) FILTER (WHERE ab.status != 'retired'), 0) AS available_qty,
         COALESCE(at.low_stock_threshold, c.low_stock_threshold)       AS effective_threshold
       FROM asset_types at
       JOIN asset_names an ON an.id = at.asset_name_id
       JOIN clubs        c  ON c.id  = at.club_id
       LEFT JOIN asset_batches ab ON ab.asset_type_id = at.id
       WHERE at.club_id = $1 AND at.is_active = true
       GROUP BY at.id, an.name, at.brand, at.model, at.size,
                at.low_stock_threshold, c.low_stock_threshold
       HAVING
         COALESCE(SUM(ab.available_quantity) FILTER (WHERE ab.status != 'retired'), 0)
         <= COALESCE(at.low_stock_threshold, c.low_stock_threshold)
       ORDER BY available_qty ASC`,
      [clubId]
    ),
  ]);

  return {
    retirement_risk:   retirementRows,
    low_stock:         lowStockRows,
    total_alert_count: retirementRows.length + lowStockRows.length,
  };
}
```

- [ ] **Step 4: Add getAlerts handler to report.controller.ts**

Append to `backend/src/controllers/report.controller.ts`:

```typescript
export const getAlerts: RequestHandler = async (req, res, next) => {
  try {
    const data = await reportService.getAlerts(req.user.club_id as string);
    res.json(data);
  } catch (err) {
    next(err);
  }
};
```

- [ ] **Step 5: Register the route in routes/reports.ts**

Add after the existing routes:

```typescript
router.get('/alerts', mgr, ctrl.getAlerts);
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd backend && npx jest --testPathPattern=reports --runInBand 2>&1 | tail -20
```

Expected: all report tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/report.service.ts \
        backend/src/controllers/report.controller.ts \
        backend/src/routes/reports.ts \
        backend/tests/reports.test.ts
git commit -m "feat(reports): add GET /reports/alerts endpoint"
```

---

## Task 4: Add GET /reports/movements/recent

New lightweight endpoint returning the 10 most recent stock movements for the club.

**Files:**
- Modify: `backend/src/services/report.service.ts`
- Modify: `backend/src/controllers/report.controller.ts`
- Modify: `backend/src/routes/reports.ts`
- Modify: `backend/tests/reports.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/reports.test.ts`:

```typescript
describe('GET /api/v1/reports/movements/recent', () => {
  it('returns array of up to 10 recent movements with required fields', async () => {
    const res = await request(app)
      .get('/api/v1/reports/movements/recent')
      .set(authHeader(managerUserId));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeLessThanOrEqual(10);
    if (res.body.length > 0) {
      expect(res.body[0]).toMatchObject({
        id:              expect.any(String),
        asset_type_name: expect.any(String),
        type:            expect.any(String),
        quantity_delta:  expect.any(Number),
        created_at:      expect.any(String),
      });
    }
  });

  it('returns 403 for coach', async () => {
    const res = await request(app)
      .get('/api/v1/reports/movements/recent')
      .set(authHeader(coachUserId));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest --testPathPattern=reports --runInBand 2>&1 | tail -10
```

Expected: new test FAILs with 404.

- [ ] **Step 3: Add getRecentMovements to report.service.ts**

Append to `backend/src/services/report.service.ts`:

```typescript
export async function getRecentMovements(clubId: string): Promise<Record<string, unknown>[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT
       sm.id,
       COALESCE(an.name, 'Unknown') AS asset_type_name,
       sm.type,
       sm.quantity_delta,
       sm.created_at
     FROM stock_movements sm
     LEFT JOIN asset_batches ab ON ab.id  = sm.asset_batch_id
     LEFT JOIN asset_types   at ON at.id  = ab.asset_type_id
     LEFT JOIN asset_names   an ON an.id  = at.asset_name_id
     WHERE sm.club_id = $1
     ORDER BY sm.created_at DESC
     LIMIT 10`,
    [clubId]
  );
  return rows;
}
```

- [ ] **Step 4: Add handler to report.controller.ts**

Append to `backend/src/controllers/report.controller.ts`:

```typescript
export const getRecentMovements: RequestHandler = async (req, res, next) => {
  try {
    const data = await reportService.getRecentMovements(req.user.club_id as string);
    res.json(data);
  } catch (err) {
    next(err);
  }
};
```

- [ ] **Step 5: Register route in routes/reports.ts**

Add after the `/alerts` route:

```typescript
router.get('/movements/recent', mgr, ctrl.getRecentMovements);
```

Note: this must be placed **before** any route with a wildcard param like `/:id` — but there are none currently, so order within the file is fine.

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd backend && npx jest --testPathPattern=reports --runInBand 2>&1 | tail -10
```

Expected: all report tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/report.service.ts \
        backend/src/controllers/report.controller.ts \
        backend/src/routes/reports.ts \
        backend/tests/reports.test.ts
git commit -m "feat(reports): add GET /reports/movements/recent endpoint"
```

---

## Task 5: Extend Club Settings — Retirement Alert Config

Extend `updateClub` to accept and persist `retirement_alert_mode` and `retirement_alert_value`. The existing `GET /clubs/me` already uses `SELECT *` so it will return the new fields automatically after the DB change in Task 1.

**Files:**
- Modify: `backend/src/services/club.service.ts`
- Modify: `backend/tests/clubs.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/clubs.test.ts`:

```typescript
describe('PUT /api/v1/clubs/me — retirement alert settings', () => {
  it('updates retirement_alert_mode and retirement_alert_value', async () => {
    const res = await request(app)
      .put('/api/v1/clubs/me')
      .set(authHeader(adminUserId))
      .send({ retirement_alert_mode: 'months', retirement_alert_value: 6 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      retirement_alert_mode:  'months',
      retirement_alert_value: 6,
    });
  });

  it('GET /clubs/me returns retirement alert fields', async () => {
    const res = await request(app)
      .get('/api/v1/clubs/me')
      .set(authHeader(adminUserId));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('retirement_alert_mode');
    expect(res.body).toHaveProperty('retirement_alert_value');
  });

  it('rejects invalid retirement_alert_mode', async () => {
    const res = await request(app)
      .put('/api/v1/clubs/me')
      .set(authHeader(adminUserId))
      .send({ retirement_alert_mode: 'invalid' });
    expect(res.status).toBe(422);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx jest --testPathPattern=clubs --runInBand 2>&1 | tail -15
```

Expected: first two tests FAIL (fields not returned / not persisted), third test FAIL (returns 200 instead of 422).

- [ ] **Step 3: Extend updateClub in club.service.ts**

Replace the `updateClub` function:

```typescript
export async function updateClub(
  clubId: string,
  {
    name,
    sport_type,
    address,
    contact_email,
    low_stock_threshold,
    retirement_alert_mode,
    retirement_alert_value,
  }: {
    name?: string;
    sport_type?: string;
    address?: string;
    contact_email?: string;
    low_stock_threshold?: unknown;
    retirement_alert_mode?: unknown;
    retirement_alert_value?: unknown;
  }
): Promise<Record<string, unknown>> {
  if (
    retirement_alert_mode !== undefined &&
    retirement_alert_mode !== null &&
    !['months', 'percent'].includes(String(retirement_alert_mode))
  ) {
    throw new AppError('retirement_alert_mode must be "months" or "percent"', 422);
  }

  const { rows } = await db.query<Record<string, unknown>>(
    `UPDATE clubs SET
       name                   = COALESCE($1, name),
       sport_type             = COALESCE($2, sport_type),
       address                = COALESCE($3, address),
       contact_email          = COALESCE($4, contact_email),
       low_stock_threshold    = COALESCE($5, low_stock_threshold),
       retirement_alert_mode  = COALESCE($6, retirement_alert_mode),
       retirement_alert_value = COALESCE($7, retirement_alert_value)
     WHERE id = $8 RETURNING *`,
    [
      name ?? null,
      sport_type ?? null,
      address ?? null,
      contact_email ?? null,
      low_stock_threshold != null ? parseInt(String(low_stock_threshold)) : null,
      retirement_alert_mode != null ? String(retirement_alert_mode) : null,
      retirement_alert_value != null ? parseInt(String(retirement_alert_value)) : null,
      clubId,
    ]
  );
  return rows[0];
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest --testPathPattern=clubs --runInBand 2>&1 | tail -15
```

Expected: all club tests PASS.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
cd backend && npx jest --runInBand 2>&1 | tail -20
```

Expected: all test suites PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/club.service.ts backend/tests/clubs.test.ts
git commit -m "feat(clubs): extend PUT /clubs/me to persist retirement alert config"
```

---

## Final Verification

- [ ] **Run the full test suite one more time**

```bash
cd backend && npx jest --runInBand 2>&1 | grep -E "Tests:|Test Suites:"
```

Expected output (numbers will vary):
```
Test Suites: N passed, N total
Tests:       N passed, N total
```

- [ ] **Verify all 6 report endpoints respond correctly**

```bash
# Requires a running backend with valid JWT. Quick smoke test:
cd backend && npx ts-node -e "
const svc = require('./src/services/report.service');
const { query } = require('./src/db');
query('SELECT id FROM clubs LIMIT 1').then(({ rows }) => {
  const clubId = rows[0].id;
  Promise.all([
    svc.getSummary(clubId),
    svc.getAlerts(clubId),
    svc.getRecentMovements(clubId),
  ]).then(([summary, alerts, recent]) => {
    console.log('summary keys:', Object.keys(summary));
    console.log('alerts keys:', Object.keys(alerts));
    console.log('recent count:', recent.length);
    process.exit(0);
  });
}).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: prints keys and counts without errors.
