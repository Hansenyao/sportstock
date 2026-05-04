# Loan Analysis by Team — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Team filter to the Loan Analysis tab so users can drill down into loan statistics for a specific team; when a team is selected, a Team Summary block (Total / Active / Overdue Loans) appears above the existing charts.

**Architecture:** `LoanAnalysisTab` becomes fully self-contained — it fetches its own teams list and loan usage data, manages a `teamId` filter state, and re-fetches when the filter changes. The backend `getLoanUsage` service gains an optional `team_id` query parameter that scopes all three SQL queries and returns an additional `team_summary` field. The parent `Analytics/index.tsx` stops fetching loan usage entirely.

**Tech Stack:** Node.js/Express + PostgreSQL (backend), React + Ant Design + Recharts (frontend), TypeScript throughout, Jest + Supertest (backend tests).

---

## File Map

| Action | File |
|--------|------|
| Modify | `backend/src/services/report.service.ts` |
| Modify | `backend/tests/reports.test.ts` |
| Modify | `frontend/src/api/reports.ts` |
| Modify | `frontend/src/pages/Analytics/tabs/LoanAnalysisTab.tsx` |
| Modify | `frontend/src/pages/Analytics/index.tsx` |

---

### Task 1: Write failing backend test for `team_id` filter

**Files:**
- Modify: `backend/tests/reports.test.ts`

- [ ] **Step 1: Add team + loan setup variables and insert them in `beforeAll`**

Open `backend/tests/reports.test.ts`. Add two variables after the existing declarations at the top of the file:

```typescript
let teamId: string;
let loanId: string;
```

Inside `beforeAll`, after the line `await createAsset(...)`, add:

```typescript
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
```

- [ ] **Step 2: Add the two new test cases for `team_id` filter**

Add a new `describe` block at the bottom of the file (before the closing of the outer scope):

```typescript
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
```

Also add `loanId` to the `afterAll` cleanup (it will be cascade-deleted when the club is deleted, so no explicit cleanup is needed — but make sure the `teamId` variable is declared in the correct scope so TypeScript does not error).

- [ ] **Step 3: Run the new tests to confirm they fail**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock/backend
npx jest reports --testNamePattern="team_id" --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `team_summary` is `undefined`, not `null` or an object.

---

### Task 2: Extend `getLoanUsage` service to support `team_id`

**Files:**
- Modify: `backend/src/services/report.service.ts`

- [ ] **Step 1: Update the function signature and return type**

Replace the current signature of `getLoanUsage` (lines 120–127):

```typescript
// OLD
export async function getLoanUsage(
  clubId: string,
  { from_date, to_date }: { from_date?: string; to_date?: string }
): Promise<{
  top_assets: Record<string, unknown>[];
  coach_summary: Record<string, unknown>[];
  monthly_trend: Record<string, unknown>[];
}>
```

with:

```typescript
// NEW
export async function getLoanUsage(
  clubId: string,
  { from_date, to_date, team_id }: { from_date?: string; to_date?: string; team_id?: string }
): Promise<{
  top_assets: Record<string, unknown>[];
  coach_summary: Record<string, unknown>[];
  monthly_trend: Record<string, unknown>[];
  team_summary: Record<string, unknown> | null;
}>
```

- [ ] **Step 2: Rebuild the params/filter logic**

Replace the current params block (lines 128–132):

```typescript
// OLD
const params: unknown[] = [clubId];
const dateFilters: string[] = [];
if (from_date) dateFilters.push(`l.created_at >= $${params.push(from_date)}`);
if (to_date)   dateFilters.push(`l.created_at <  $${params.push(to_date)}`);
const dateWhere = dateFilters.length ? ' AND ' + dateFilters.join(' AND ') : '';
```

with:

```typescript
// NEW
const params: unknown[] = [clubId];
const extraWhere: string[] = [];
if (team_id)   extraWhere.push(`l.team_id = $${params.push(team_id)}`);
if (from_date) extraWhere.push(`l.created_at >= $${params.push(from_date)}`);
if (to_date)   extraWhere.push(`l.created_at <  $${params.push(to_date)}`);
const filterWhere = extraWhere.length ? ' AND ' + extraWhere.join(' AND ') : '';

// Separate params for monthly_trend (no alias prefix on column names)
const trendParams: unknown[] = [clubId];
const trendWhere = team_id ? ` AND team_id = $${trendParams.push(team_id)}` : '';
```

- [ ] **Step 3: Update the three parallel queries, then fetch team_summary separately**

Replace the entire `Promise.all` block and `return` statement (lines 134–173) with:

```typescript
  const [topAssets, coachSummary, monthlyTrend] = await Promise.all([
    db.query<Record<string, unknown>>(
      `SELECT at.id, an.name,
              COUNT(DISTINCT l.id) AS loan_count,
              SUM(li.quantity)     AS total_quantity_borrowed
       FROM loan_items li
       JOIN loans       l  ON l.id  = li.loan_id
       JOIN asset_types at ON at.id = li.asset_type_id
       JOIN asset_names an ON an.id = at.asset_name_id
       WHERE l.club_id = $1 AND l.status != 'pending' ${filterWhere}
       GROUP BY at.id, an.name
       ORDER BY loan_count DESC
       LIMIT 10`,
      params
    ),
    db.query<Record<string, unknown>>(
      `SELECT u.id, u.name,
              COUNT(DISTINCT l.id)                                          AS loan_count,
              COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'checked_out') AS active_loans
       FROM loans l
       JOIN users u ON u.id = l.coach_id
       WHERE l.club_id = $1 ${filterWhere}
       GROUP BY u.id, u.name
       ORDER BY loan_count DESC`,
      params
    ),
    db.query<Record<string, unknown>>(
      `SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month, COUNT(*) AS loan_count
       FROM loans
       WHERE club_id = $1 AND created_at >= NOW() - INTERVAL '6 months' ${trendWhere}
       GROUP BY month ORDER BY month`,
      trendParams
    ),
  ]);

  let teamSummaryRow: Record<string, unknown> | undefined;
  if (team_id) {
    const { rows } = await db.query<Record<string, unknown>>(
      `SELECT t.id, t.name, t.age_group, t.gender,
              COUNT(DISTINCT l.id)                                          AS total_loans,
              COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'checked_out') AS active_loans,
              COUNT(DISTINCT l.id) FILTER (
                WHERE l.status = 'checked_out' AND l.due_date < CURRENT_DATE
              ) AS overdue_loans
       FROM teams t
       LEFT JOIN loans l ON l.team_id = t.id AND l.club_id = $1
       WHERE t.id = $2
       GROUP BY t.id, t.name, t.age_group, t.gender`,
      [clubId, team_id]
    );
    teamSummaryRow = rows[0];
  }

  return {
    top_assets:    topAssets.rows,
    coach_summary: coachSummary.rows,
    monthly_trend: monthlyTrend.rows,
    team_summary:  teamSummaryRow ?? null,
  };
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock/backend
npx jest reports --no-coverage 2>&1 | tail -20
```

Expected: all reports tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/report.service.ts backend/tests/reports.test.ts
git commit -m "feat(reports): add team_id filter and team_summary to getLoanUsage"
```

---

### Task 3: Update frontend API types and `getLoanUsage` function

**Files:**
- Modify: `frontend/src/api/reports.ts`

- [ ] **Step 1: Add `TeamSummary` interface and extend `LoanUsageReport`**

After the `MonthlyTrend` interface (after line 97), add:

```typescript
export interface TeamSummary {
  id: string;
  name: string;
  age_group: string;
  gender: string;
  total_loans: number;
  active_loans: number;
  overdue_loans: number;
}
```

Then update `LoanUsageReport` (lines 99–103):

```typescript
// OLD
export interface LoanUsageReport {
  top_assets: TopAsset[];
  coach_summary: CoachSummary[];
  monthly_trend: MonthlyTrend[];
}
```

```typescript
// NEW
export interface LoanUsageReport {
  top_assets: TopAsset[];
  coach_summary: CoachSummary[];
  monthly_trend: MonthlyTrend[];
  team_summary: TeamSummary | null;
}
```

- [ ] **Step 2: Update `getLoanUsage` to accept optional params and coerce `team_summary`**

Replace the entire `getLoanUsage` function (lines 155–180):

```typescript
// OLD
export function getLoanUsage(): Promise<LoanUsageReport> {
  return client
    .get<{
      top_assets: Record<string, unknown>[];
      coach_summary: Record<string, unknown>[];
      monthly_trend: Record<string, unknown>[];
    }>('/reports/loan-usage')
    .then(r => ({
      top_assets: r.data.top_assets.map(x => ({
        id: String(x.id),
        name: String(x.name),
        loan_count: Number(x.loan_count),
        total_quantity_borrowed: Number(x.total_quantity_borrowed),
      })),
      coach_summary: r.data.coach_summary.map(x => ({
        id: String(x.id),
        name: String(x.name),
        loan_count: Number(x.loan_count),
        active_loans: Number(x.active_loans),
      })),
      monthly_trend: r.data.monthly_trend.map(x => ({
        month: String(x.month),
        loan_count: Number(x.loan_count),
      })),
    }));
}
```

```typescript
// NEW
export function getLoanUsage(params?: { team_id?: string }): Promise<LoanUsageReport> {
  return client
    .get<{
      top_assets: Record<string, unknown>[];
      coach_summary: Record<string, unknown>[];
      monthly_trend: Record<string, unknown>[];
      team_summary: Record<string, unknown> | null;
    }>('/reports/loan-usage', { params })
    .then(r => ({
      top_assets: r.data.top_assets.map(x => ({
        id: String(x.id),
        name: String(x.name),
        loan_count: Number(x.loan_count),
        total_quantity_borrowed: Number(x.total_quantity_borrowed),
      })),
      coach_summary: r.data.coach_summary.map(x => ({
        id: String(x.id),
        name: String(x.name),
        loan_count: Number(x.loan_count),
        active_loans: Number(x.active_loans),
      })),
      monthly_trend: r.data.monthly_trend.map(x => ({
        month: String(x.month),
        loan_count: Number(x.loan_count),
      })),
      team_summary: r.data.team_summary
        ? {
            id:            String(r.data.team_summary.id),
            name:          String(r.data.team_summary.name),
            age_group:     String(r.data.team_summary.age_group),
            gender:        String(r.data.team_summary.gender),
            total_loans:   Number(r.data.team_summary.total_loans),
            active_loans:  Number(r.data.team_summary.active_loans),
            overdue_loans: Number(r.data.team_summary.overdue_loans),
          }
        : null,
    }));
}
```

- [ ] **Step 3: Verify TypeScript compiles without errors**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock/frontend
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors related to `reports.ts`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/reports.ts
git commit -m "feat(reports): add TeamSummary type and team_id param to getLoanUsage API"
```

---

### Task 4: Refactor `LoanAnalysisTab` to be self-contained

**Files:**
- Modify: `frontend/src/pages/Analytics/tabs/LoanAnalysisTab.tsx`

- [ ] **Step 1: Replace the entire file content**

Replace `frontend/src/pages/Analytics/tabs/LoanAnalysisTab.tsx` with:

```tsx
import { useState, useEffect, useCallback } from 'react';
import { useId } from 'react';
import { Row, Col, Card, Table, Typography, Progress, Select, Statistic, Spin, Alert, Flex } from 'antd';
import type { TableProps } from 'antd';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { getLoanUsage } from '../../../api/reports';
import { listTeams } from '../../../api/teams';
import type { LoanUsageReport, CoachSummary } from '../../../api/reports';
import type { Team } from '../../../api/teams';

const { Text } = Typography;

export default function LoanAnalysisTab() {
  const gradientId = `loanGradient-${useId()}`;
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState<string | undefined>(undefined);
  const [loanUsage, setLoanUsage] = useState<LoanUsageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLoanUsage = useCallback((tid: string | undefined) => {
    setLoading(true);
    setError(null);
    getLoanUsage(tid ? { team_id: tid } : undefined)
      .then(data => setLoanUsage(data))
      .catch(() => setError('Failed to load loan data. Please try again.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    listTeams().then(r => setTeams(r.data)).catch(() => {});
    fetchLoanUsage(undefined);
  }, [fetchLoanUsage]);

  function handleTeamChange(val: string | undefined) {
    setTeamId(val);
    fetchLoanUsage(val);
  }

  const maxLoanCount = loanUsage?.top_assets.reduce((m, a) => Math.max(m, a.loan_count), 1) ?? 1;

  const coachColumns: TableProps<CoachSummary>['columns'] = [
    { title: 'Coach',        dataIndex: 'name',         key: 'name' },
    { title: 'Total Loans',  dataIndex: 'loan_count',   key: 'loan_count',   width: 110 },
    { title: 'Active Loans', dataIndex: 'active_loans', key: 'active_loans', width: 110 },
  ];

  if (loading) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: 200 }}>
        <Spin />
      </Flex>
    );
  }

  if (error || !loanUsage) {
    return <Alert type="error" message={error ?? 'Failed to load loan data.'} />;
  }

  return (
    <div>
      {/* Team Filter */}
      {teams.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Select
            allowClear
            placeholder="All Teams"
            style={{ width: 240 }}
            value={teamId}
            options={teams.map(t => ({ value: t.id, label: `${t.name} (${t.age_group} ${t.gender})` }))}
            onChange={val => handleTeamChange(val)}
          />
        </div>
      )}

      {/* Team Summary Cards — only when a team is selected */}
      {loanUsage.team_summary && (
        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
          <Col xs={24} sm={8}>
            <Card style={{ borderRadius: 12, border: 'none' }}>
              <Statistic title="Total Loans" value={loanUsage.team_summary.total_loans} />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card style={{ borderRadius: 12, border: 'none' }}>
              <Statistic
                title="Active Loans"
                value={loanUsage.team_summary.active_loans}
                valueStyle={{ color: '#1677ff' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card style={{ borderRadius: 12, border: 'none' }}>
              <Statistic
                title="Overdue Loans"
                value={loanUsage.team_summary.overdue_loans}
                valueStyle={{ color: loanUsage.team_summary.overdue_loans > 0 ? '#ff4d4f' : undefined }}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Monthly Loan Trend */}
      <Card
        title="Monthly Loan Trend (Past 6 Months)"
        style={{ borderRadius: 12, border: 'none', marginBottom: 20 }}
      >
        {loanUsage.monthly_trend.length === 0 ? (
          <Text type="secondary">No loan data in the past 6 months</Text>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart
              data={loanUsage.monthly_trend}
              margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#1677ff" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#1677ff" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="loan_count"
                stroke="#1677ff"
                fill={`url(#${gradientId})`}
                name="Loans"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Top Borrowed Assets" style={{ borderRadius: 12, border: 'none' }}>
            {loanUsage.top_assets.length === 0 ? (
              <Text type="secondary">No loan data</Text>
            ) : (
              <div>
                {loanUsage.top_assets.map((asset, i) => (
                  <div key={asset.id} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text>
                        <Text type="secondary" style={{ marginRight: 8 }}>#{i + 1}</Text>
                        {asset.name}
                      </Text>
                      <Text strong>{asset.loan_count} loans</Text>
                    </div>
                    <Progress
                      percent={Math.round((asset.loan_count / maxLoanCount) * 100)}
                      showInfo={false}
                      strokeColor="#1677ff"
                      size="small"
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Loan Activity by Coach" style={{ borderRadius: 12, border: 'none' }}>
            <Table<CoachSummary>
              dataSource={loanUsage.coach_summary}
              columns={coachColumns}
              rowKey="id"
              pagination={false}
              size="small"
              scroll={{ x: 400 }}
              locale={{ emptyText: 'No coach activity' }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles without errors**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock/frontend
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Analytics/tabs/LoanAnalysisTab.tsx
git commit -m "feat(analytics): make LoanAnalysisTab self-contained with team filter"
```

---

### Task 5: Clean up Analytics parent page

**Files:**
- Modify: `frontend/src/pages/Analytics/index.tsx`

- [ ] **Step 1: Remove `getLoanUsage` and `LoanUsageReport` from imports**

Current import line (line 6–9):

```typescript
import {
  getSummary, getDepreciation, getAlerts, getLoanUsage, getMovements, getRecentMovements,
  type SummaryReport, type DepreciationReport, type AlertsReport,
  type LoanUsageReport, type MovementSummary, type RecentMovement,
} from '../../api/reports';
```

Replace with:

```typescript
import {
  getSummary, getDepreciation, getAlerts, getMovements, getRecentMovements,
  type SummaryReport, type DepreciationReport, type AlertsReport,
  type MovementSummary, type RecentMovement,
} from '../../api/reports';
```

- [ ] **Step 2: Remove `loanUsage` from `PageData` interface**

Current (lines 18–26):

```typescript
interface PageData {
  summary: SummaryReport;
  depreciation: DepreciationReport;
  alerts: AlertsReport;
  loanUsage: LoanUsageReport;
  movements: MovementSummary[];
  recentMovements: RecentMovement[];
  club: Club;
}
```

Replace with:

```typescript
interface PageData {
  summary: SummaryReport;
  depreciation: DepreciationReport;
  alerts: AlertsReport;
  movements: MovementSummary[];
  recentMovements: RecentMovement[];
  club: Club;
}
```

- [ ] **Step 3: Remove `getLoanUsage()` from the parallel fetch**

Current (lines 44–54):

```typescript
        const [summary, depreciation, alerts, loanUsage, movements, recentMovements, club] =
          await Promise.all([
            getSummary(),
            getDepreciation(),
            getAlerts(),
            getLoanUsage(),
            getMovements(),
            getRecentMovements(),
            getMyClub(),
          ]);
        setData({ summary, depreciation, alerts, loanUsage, movements, recentMovements, club });
```

Replace with:

```typescript
        const [summary, depreciation, alerts, movements, recentMovements, club] =
          await Promise.all([
            getSummary(),
            getDepreciation(),
            getAlerts(),
            getMovements(),
            getRecentMovements(),
            getMyClub(),
          ]);
        setData({ summary, depreciation, alerts, movements, recentMovements, club });
```

- [ ] **Step 4: Remove `loanUsage` prop from `<LoanAnalysisTab />`**

Current (line 103):

```typescript
      children: <LoanAnalysisTab loanUsage={data.loanUsage} />,
```

Replace with:

```typescript
      children: <LoanAnalysisTab />,
```

- [ ] **Step 5: Verify TypeScript compiles without errors**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock/frontend
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Analytics/index.tsx
git commit -m "refactor(analytics): remove loanUsage from parent page; tab is now self-contained"
```

---

## Manual Verification Checklist

After all tasks complete, verify in the browser:

1. Open Analytics → Loan Analysis tab — data loads correctly with no Team filter active
2. If the club has teams: the "All Teams" Select appears in the top-left
3. Select a team → Team Summary Cards appear showing Total / Active / Overdue counts; charts update
4. Clear the filter (click ×) → Summary Cards disappear; charts restore to full-club data
5. If teams list fails to load (e.g., network error) → filter is absent but loan data still shows
6. If loan usage fails to load → inline `<Alert type="error">` appears inside the tab; other tabs are unaffected
