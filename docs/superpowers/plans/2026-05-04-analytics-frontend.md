# Analytics Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 4-tab Analytics page at `/dashboard/analytics` (club_admin and asset_manager only), plus an Analytics Alert Thresholds settings section in Club Profile.

**Architecture:** All report data is fetched in parallel on the Analytics page mount and passed as props to individual tab components. Each tab is a pure presentational component — no data fetching of its own. The existing `GET /clubs/me` endpoint (already returns `retirement_alert_mode`, `retirement_alert_value`, `low_stock_threshold`) provides alert config. TypeScript interfaces for report data are centralized in `frontend/src/api/reports.ts`.

**Tech Stack:** React 19, Ant Design v6, Recharts v2, TypeScript 6, Vite 8

---

## File Map

| File | Change |
|------|--------|
| `frontend/package.json` | Add `recharts` dependency |
| `frontend/src/api/reports.ts` | New — API functions + all TypeScript interfaces |
| `frontend/src/api/clubs.ts` | Extend `Club` interface + `updateMyClub` to accept alert config fields |
| `frontend/src/router/index.tsx` | Add `/dashboard/analytics` route |
| `frontend/src/layouts/DashboardLayout.tsx` | Add Analytics nav item (manager + admin only) |
| `frontend/src/pages/Analytics/index.tsx` | New — page with role guard, parallel data fetch, 4-tab layout |
| `frontend/src/pages/Analytics/tabs/OverviewTab.tsx` | New — status cards, financial cards, pie + bar charts |
| `frontend/src/pages/Analytics/tabs/AlertsTab.tsx` | New — retirement risk + low stock tables |
| `frontend/src/pages/Analytics/tabs/LoanAnalysisTab.tsx` | New — monthly trend AreaChart + top assets + coach table |
| `frontend/src/pages/Analytics/tabs/StockMovementsTab.tsx` | New — movement summary cards + horizontal BarChart + recent table |
| `frontend/src/pages/ClubProfile/index.tsx` | Append Analytics Alert Thresholds settings section |

---

## Task 1: Add recharts + create API clients

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/api/reports.ts`
- Modify: `frontend/src/api/clubs.ts`

- [ ] **Step 1: Add recharts to `frontend/package.json`**

In `frontend/package.json`, add to the `"dependencies"` object:

```json
"recharts": "^2.15.0"
```

- [ ] **Step 2: Install**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock/frontend && npm install
```

Expected: recharts installed with no errors.

- [ ] **Step 3: Create `frontend/src/api/reports.ts`**

```typescript
import client from './client';

// ─── Types ────────────────────────────────────────────────────────────────

export interface CategoryBreakdown {
  category_name: string;
  total_qty: number;
  available_qty: number;
}

export interface SummaryReport {
  total_assets: number;
  total_items: number;
  available_items: number;
  total_purchase_value: number;
  active_total: number;
  available_qty: number;
  on_loan_qty: number;
  maintenance_qty: number;
  retired_qty: number;
  active_loans: number;
  overdue_loans: number;
  category_breakdown: CategoryBreakdown[];
}

export interface DepreciationItem {
  batch_id: string;
  asset_name: string;
  brand: string | null;
  model: string | null;
  purchase_date: string;
  purchase_price: number;
  total_quantity: number;
  useful_life_years: number;
  years_elapsed: number;
  annual_depreciation: number;
  accumulated_depreciation: number;
  net_book_value: number;
}

export interface DepreciationReport {
  items: DepreciationItem[];
  summary: {
    total_batches_with_depreciation: number;
    total_purchase_value: string;
    total_net_book_value: string;
    total_accumulated_depreciation: string;
  };
}

export interface RetirementRiskItem {
  batch_id: string;
  asset_name: string;
  brand: string | null;
  model: string | null;
  size: string | null;
  purchase_date: string;
  useful_life_years: number;
  total_quantity: number;
  batch_status: string;
  life_used_percent: number;
}

export interface LowStockItem {
  asset_type_id: string;
  asset_name: string;
  brand: string | null;
  model: string | null;
  size: string | null;
  total_qty: number;
  available_qty: number;
  effective_threshold: number;
}

export interface AlertsReport {
  retirement_risk: RetirementRiskItem[];
  low_stock: LowStockItem[];
  total_alert_count: number;
}

export interface TopAsset {
  id: string;
  name: string;
  loan_count: number;
  total_quantity_borrowed: number;
}

export interface CoachSummary {
  id: string;
  name: string;
  loan_count: number;
  active_loans: number;
}

export interface MonthlyTrend {
  month: string;
  loan_count: number;
}

export interface LoanUsageReport {
  top_assets: TopAsset[];
  coach_summary: CoachSummary[];
  monthly_trend: MonthlyTrend[];
}

export interface MovementSummary {
  type: string;
  count: number;
  total_units: number;
}

export interface RecentMovement {
  id: string;
  asset_type_name: string;
  type: string;
  quantity_delta: number;
  created_at: string;
}

// ─── API functions ─────────────────────────────────────────────────────────

export function getSummary(): Promise<SummaryReport> {
  return client.get<SummaryReport>('/reports/summary').then(r => r.data);
}

export function getDepreciation(): Promise<DepreciationReport> {
  return client.get<DepreciationReport>('/reports/depreciation').then(r => r.data);
}

export function getAlerts(): Promise<AlertsReport> {
  return client.get<AlertsReport>('/reports/alerts').then(r => r.data);
}

// getLoanUsage coerces pg aggregate strings (COUNT/SUM) to numbers
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

// getMovements coerces pg aggregate strings to numbers
export function getMovements(): Promise<MovementSummary[]> {
  return client
    .get<Record<string, unknown>[]>('/reports/movements')
    .then(r =>
      r.data.map(x => ({
        type: String(x.type),
        count: Number(x.count),
        total_units: Number(x.total_units),
      }))
    );
}

export function getRecentMovements(): Promise<RecentMovement[]> {
  return client.get<RecentMovement[]>('/reports/movements/recent').then(r => r.data);
}
```

- [ ] **Step 4: Extend `frontend/src/api/clubs.ts`**

Replace the entire file:

```typescript
import client from './client';

export interface Club {
  id: string;
  name: string;
  sport_type: string;
  address?: string | null;
  contact_email: string;
  logo_url?: string | null;
  low_stock_threshold: number;
  retirement_alert_mode: 'months' | 'percent';
  retirement_alert_value: number;
  created_at: string;
}

export const getMyClub = () =>
  client.get<Club>('/clubs/me');

export const updateMyClub = (
  data: Partial<Pick<
    Club,
    | 'name' | 'sport_type' | 'address' | 'contact_email'
    | 'low_stock_threshold' | 'retirement_alert_mode' | 'retirement_alert_value'
  >>
) => client.put<Club>('/clubs/me', data);
```

- [ ] **Step 5: Verify build**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock/frontend && npm run build 2>&1 | tail -10
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock && git add frontend/package.json frontend/package-lock.json frontend/src/api/reports.ts frontend/src/api/clubs.ts
git commit -m "feat(analytics): add recharts, reports API client, extend Club type"
```

---

## Task 2: Add Analytics nav item and route

**Files:**
- Modify: `frontend/src/layouts/DashboardLayout.tsx`
- Modify: `frontend/src/router/index.tsx`
- Create: `frontend/src/pages/Analytics/index.tsx` (placeholder)

- [ ] **Step 1: Add BarChartOutlined to icon imports in `DashboardLayout.tsx`**

Replace the existing `@ant-design/icons` import (lines 3–7):

```typescript
import {
  DashboardOutlined, DatabaseOutlined, SwapOutlined,
  TeamOutlined, BankOutlined, LogoutOutlined, MenuOutlined,
  AppstoreOutlined, DeleteOutlined, TrophyOutlined, TagOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
```

- [ ] **Step 2: Add Analytics nav item to NAV_ITEMS**

Replace the `NAV_ITEMS` array (lines 22–31) with:

```typescript
const NAV_ITEMS = [
  { key: '/dashboard',             icon: <DashboardOutlined />,  label: 'Overview' },
  { key: '/dashboard/asset-names', icon: <TagOutlined />,        label: 'Asset Names', managerOnly: true },
  { key: '/dashboard/assets',      icon: <DatabaseOutlined />,   label: 'Assets' },
  { key: '/dashboard/loans',       icon: <SwapOutlined />,       label: 'Loans' },
  { key: '/dashboard/write-offs',  icon: <DeleteOutlined />,     label: 'Write-offs',  managerOnly: true },
  { key: '/dashboard/analytics',   icon: <BarChartOutlined />,   label: 'Analytics',   managerOnly: true },
  { key: '/dashboard/users',       icon: <TeamOutlined />,       label: 'Users',       adminOnly: true },
  { key: '/dashboard/teams',       icon: <TrophyOutlined />,     label: 'Teams',       adminOnly: true },
  { key: '/dashboard/club',        icon: <BankOutlined />,       label: 'Club Profile' },
];
```

- [ ] **Step 3: Create placeholder `frontend/src/pages/Analytics/index.tsx`**

```typescript
import { Spin, Flex } from 'antd';

export default function AnalyticsPage() {
  return (
    <Flex justify="center" align="center" style={{ minHeight: 300 }}>
      <Spin size="large" />
    </Flex>
  );
}
```

- [ ] **Step 4: Add route to `frontend/src/router/index.tsx`**

Add the import alongside existing page imports:

```typescript
import AnalyticsPage from '../pages/Analytics';
```

Add the route inside the protected dashboard block, after `/dashboard/write-offs` and before `/dashboard/users`:

```typescript
<Route path="/dashboard/analytics" element={<AnalyticsPage />} />
```

- [ ] **Step 5: Verify build**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock/frontend && npm run build 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock && git add frontend/src/layouts/DashboardLayout.tsx frontend/src/router/index.tsx frontend/src/pages/Analytics/index.tsx
git commit -m "feat(analytics): add Analytics nav item and route placeholder"
```

---

## Task 3: Overview Tab

**Files:**
- Create: `frontend/src/pages/Analytics/tabs/OverviewTab.tsx`

Renders Section A (5 status cards), Section B (3 financial cards + depreciation rate), Section C (Pie chart + Bar chart).

- [ ] **Step 1: Create `frontend/src/pages/Analytics/tabs/OverviewTab.tsx`**

```typescript
import { Row, Col, Card, Statistic, Progress, Typography, Flex } from 'antd';
import {
  CheckCircleOutlined, SwapOutlined, ToolOutlined, StopOutlined,
  AppstoreOutlined, DollarOutlined,
} from '@ant-design/icons';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import type { SummaryReport, DepreciationReport } from '../../../api/reports';

const { Title, Text } = Typography;

const PIE_COLORS = [
  '#1677ff', '#52c41a', '#722ed1', '#fa8c16',
  '#eb2f96', '#13c2c2', '#faad14', '#f5222d',
];

interface Props {
  summary: SummaryReport;
  depreciation: DepreciationReport;
}

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}

function StatCard({ title, value, icon, color }: StatCardProps) {
  return (
    <Card style={{ borderRadius: 12, border: 'none' }} styles={{ body: { padding: 20 } }}>
      <Flex align="flex-start" gap={16}>
        <div style={{
          width: 48, height: 48, background: color, borderRadius: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {icon}
        </div>
        <div>
          <Text style={{ fontSize: 13, color: '#8c8c8c', display: 'block' }}>{title}</Text>
          <Statistic value={value} valueStyle={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2 }} />
        </div>
      </Flex>
    </Card>
  );
}

export default function OverviewTab({ summary, depreciation }: Props) {
  const originalValue = summary.total_purchase_value;
  const netValue = Number(depreciation.summary.total_net_book_value);
  const depRate = originalValue > 0
    ? Math.round(((originalValue - netValue) / originalValue) * 100)
    : 0;

  const fmt = (v: number) =>
    `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const statusCards: StatCardProps[] = [
    { title: 'Active Total',   value: summary.active_total,    icon: <AppstoreOutlined style={{ fontSize: 22, color: '#1677ff' }} />, color: '#e6f4ff' },
    { title: 'Available',      value: summary.available_qty,   icon: <CheckCircleOutlined style={{ fontSize: 22, color: '#52c41a' }} />, color: '#f6ffed' },
    { title: 'On Loan',        value: summary.on_loan_qty,     icon: <SwapOutlined style={{ fontSize: 22, color: '#722ed1' }} />, color: '#f9f0ff' },
    { title: 'In Maintenance', value: summary.maintenance_qty, icon: <ToolOutlined style={{ fontSize: 22, color: '#fa8c16' }} />, color: '#fff7e6' },
    { title: 'Retired',        value: summary.retired_qty,     icon: <StopOutlined style={{ fontSize: 22, color: '#8c8c8c' }} />, color: '#f5f5f5' },
  ];

  const pieData = summary.category_breakdown.map(c => ({ name: c.category_name, value: c.total_qty }));
  const barData = summary.category_breakdown.map(c => ({ name: c.category_name, available: c.available_qty }));

  return (
    <div>
      {/* Section A — Asset Status */}
      <Title level={5} style={{ marginBottom: 12, marginTop: 0 }}>Asset Status</Title>
      <Row gutter={[12, 12]} style={{ marginBottom: 24 }}>
        {statusCards.map(card => (
          <Col xs={12} sm={8} lg={Math.floor(24 / 5)} key={card.title}>
            <StatCard {...card} />
          </Col>
        ))}
      </Row>

      {/* Section B — Financial Summary */}
      <Title level={5} style={{ marginBottom: 12 }}>Financial Summary</Title>
      <Row gutter={[12, 12]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 12, border: 'none' }} styles={{ body: { padding: 20 } }}>
            <Flex align="flex-start" gap={16}>
              <div style={{ width: 48, height: 48, background: '#e6f4ff', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <DollarOutlined style={{ fontSize: 22, color: '#1677ff' }} />
              </div>
              <div>
                <Text style={{ fontSize: 13, color: '#8c8c8c', display: 'block' }}>Original Value</Text>
                <Text style={{ fontSize: 20, fontWeight: 700 }}>{fmt(originalValue)}</Text>
              </div>
            </Flex>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 12, border: 'none' }} styles={{ body: { padding: 20 } }}>
            <Flex align="flex-start" gap={16}>
              <div style={{ width: 48, height: 48, background: '#f6ffed', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <DollarOutlined style={{ fontSize: 22, color: '#52c41a' }} />
              </div>
              <div>
                <Text style={{ fontSize: 13, color: '#8c8c8c', display: 'block' }}>Current Net Value</Text>
                <Text style={{ fontSize: 20, fontWeight: 700 }}>{fmt(netValue)}</Text>
              </div>
            </Flex>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 12, border: 'none' }} styles={{ body: { padding: 20 } }}>
            <Text style={{ fontSize: 13, color: '#8c8c8c', display: 'block', marginBottom: 4 }}>Depreciation Rate</Text>
            <Text style={{ fontSize: 20, fontWeight: 700 }}>{depRate}%</Text>
            <Progress percent={depRate} showInfo={false} strokeColor="#fa8c16" style={{ marginTop: 8 }} />
          </Card>
        </Col>
      </Row>

      {/* Section C — Charts */}
      <Title level={5} style={{ marginBottom: 12 }}>Asset Distribution</Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card title="Distribution by Category" style={{ borderRadius: 12, border: 'none' }}>
            {pieData.length === 0 ? (
              <Text type="secondary">No category data available</Text>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Available Quantity by Category" style={{ borderRadius: 12, border: 'none' }}>
            {barData.length === 0 ? (
              <Text type="secondary">No category data available</Text>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={barData} margin={{ top: 8, right: 16, left: 0, bottom: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-30} textAnchor="end" interval={0} tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="available" fill="#1677ff" radius={[4, 4, 0, 0]} name="Available" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock/frontend && npm run build 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock && git add frontend/src/pages/Analytics/tabs/OverviewTab.tsx
git commit -m "feat(analytics): add Overview tab"
```

---

## Task 4: Alerts Tab

**Files:**
- Create: `frontend/src/pages/Analytics/tabs/AlertsTab.tsx`

Retirement risk table (progress bar + status badge) and low stock table (status badge). Inline links navigate to Club Profile settings.

- [ ] **Step 1: Create `frontend/src/pages/Analytics/tabs/AlertsTab.tsx`**

```typescript
import { Table, Progress, Tag, Typography, Space, Card } from 'antd';
import { WarningOutlined, SettingOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { AlertsReport, RetirementRiskItem, LowStockItem } from '../../../api/reports';

const { Title, Text, Link } = Typography;

interface Props {
  alerts: AlertsReport;
  club: {
    retirement_alert_mode: 'months' | 'percent';
    retirement_alert_value: number;
    low_stock_threshold: number;
  };
}

export default function AlertsTab({ alerts, club }: Props) {
  const navigate = useNavigate();

  const thresholdLabel =
    club.retirement_alert_mode === 'percent'
      ? `${club.retirement_alert_value}% life elapsed`
      : `${club.retirement_alert_value} months remaining`;

  const retirementColumns = [
    {
      title: 'Asset',
      key: 'asset',
      render: (_: unknown, row: RetirementRiskItem) => (
        <div>
          <Text strong>{row.asset_name}</Text>
          {(row.brand || row.model || row.size) && (
            <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
              {[row.brand, row.model, row.size].filter(Boolean).join(' / ')}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: 'Purchase Date',
      dataIndex: 'purchase_date',
      key: 'purchase_date',
      width: 120,
      render: (v: string) => new Date(v).toLocaleDateString(),
    },
    {
      title: 'Useful Life',
      dataIndex: 'useful_life_years',
      key: 'useful_life_years',
      width: 100,
      render: (v: number) => `${v} yr${v !== 1 ? 's' : ''}`,
    },
    {
      title: 'Life Used',
      key: 'life_used',
      width: 180,
      render: (_: unknown, row: RetirementRiskItem) => (
        <Space direction="vertical" size={2} style={{ width: '100%' }}>
          <Progress
            percent={Math.min(row.life_used_percent, 100)}
            strokeColor={row.life_used_percent >= 90 ? '#ff4d4f' : '#fa8c16'}
            size="small"
            showInfo={false}
          />
          <Text style={{ fontSize: 12 }}>{row.life_used_percent}%</Text>
        </Space>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 90,
      render: (_: unknown, row: RetirementRiskItem) =>
        row.life_used_percent >= 90
          ? <Tag color="red">Critical</Tag>
          : <Tag color="orange">Warning</Tag>,
    },
    {
      title: 'Qty',
      dataIndex: 'total_quantity',
      key: 'total_quantity',
      width: 60,
    },
  ];

  const lowStockColumns = [
    {
      title: 'Asset Type',
      key: 'asset',
      render: (_: unknown, row: LowStockItem) => (
        <div>
          <Text strong>{row.asset_name}</Text>
          {(row.brand || row.model || row.size) && (
            <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
              {[row.brand, row.model, row.size].filter(Boolean).join(' / ')}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: 'Total Qty',
      dataIndex: 'total_qty',
      key: 'total_qty',
      width: 90,
      render: (v: number) => Number(v),
    },
    {
      title: 'Available',
      dataIndex: 'available_qty',
      key: 'available_qty',
      width: 90,
      render: (v: number) => Number(v),
    },
    {
      title: 'Threshold',
      dataIndex: 'effective_threshold',
      key: 'effective_threshold',
      width: 90,
      render: (v: number) => Number(v),
    },
    {
      title: 'Status',
      key: 'status',
      width: 110,
      render: (_: unknown, row: LowStockItem) =>
        Number(row.available_qty) === 0
          ? <Tag color="red">Out of Stock</Tag>
          : <Tag color="orange">Low Stock</Tag>,
    },
  ];

  return (
    <div>
      <Card
        style={{ borderRadius: 12, border: 'none', marginBottom: 20 }}
        title={
          <Space>
            <WarningOutlined style={{ color: '#fa8c16' }} />
            <span>Retirement Risk</span>
            <Text type="secondary" style={{ fontWeight: 400, fontSize: 13 }}>
              ({alerts.retirement_risk.length})
            </Text>
          </Space>
        }
        extra={
          <Link onClick={() => navigate('/dashboard/club')}>
            <SettingOutlined /> Threshold: {thresholdLabel} · Edit in Settings
          </Link>
        }
      >
        <Table
          dataSource={alerts.retirement_risk}
          columns={retirementColumns}
          rowKey="batch_id"
          pagination={false}
          size="small"
          scroll={{ x: 600 }}
          locale={{ emptyText: 'No retirement-risk batches' }}
        />
      </Card>

      <Card
        style={{ borderRadius: 12, border: 'none' }}
        title={
          <Space>
            <WarningOutlined style={{ color: '#ff4d4f' }} />
            <span>Low Stock — Procurement Needed</span>
            <Text type="secondary" style={{ fontWeight: 400, fontSize: 13 }}>
              ({alerts.low_stock.length})
            </Text>
          </Space>
        }
        extra={
          <Link onClick={() => navigate('/dashboard/club')}>
            <SettingOutlined /> Club default threshold: {club.low_stock_threshold} · Edit in Settings
          </Link>
        }
      >
        <Table
          dataSource={alerts.low_stock}
          columns={lowStockColumns}
          rowKey="asset_type_id"
          pagination={false}
          size="small"
          scroll={{ x: 500 }}
          locale={{ emptyText: 'No low-stock asset types' }}
        />
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock/frontend && npm run build 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock && git add frontend/src/pages/Analytics/tabs/AlertsTab.tsx
git commit -m "feat(analytics): add Alerts tab"
```

---

## Task 5: Loan Analysis Tab

**Files:**
- Create: `frontend/src/pages/Analytics/tabs/LoanAnalysisTab.tsx`

Monthly trend AreaChart (past 6 months), top borrowed ranked list with inline relative bars, coach activity table.

- [ ] **Step 1: Create `frontend/src/pages/Analytics/tabs/LoanAnalysisTab.tsx`**

```typescript
import { Row, Col, Card, Table, Typography, Progress } from 'antd';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { LoanUsageReport, CoachSummary } from '../../../api/reports';

const { Text } = Typography;

interface Props {
  loanUsage: LoanUsageReport;
}

export default function LoanAnalysisTab({ loanUsage }: Props) {
  const maxLoanCount = loanUsage.top_assets.reduce((m, a) => Math.max(m, a.loan_count), 1);

  const coachColumns = [
    { title: 'Coach',        dataIndex: 'name',        key: 'name' },
    { title: 'Total Loans',  dataIndex: 'loan_count',  key: 'loan_count',  width: 110 },
    { title: 'Active Loans', dataIndex: 'active_loans', key: 'active_loans', width: 110 },
  ];

  return (
    <div>
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
                <linearGradient id="loanGradient" x1="0" y1="0" x2="0" y2="1">
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
                fill="url(#loanGradient)"
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
              locale={{ emptyText: 'No coach activity' }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock/frontend && npm run build 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock && git add frontend/src/pages/Analytics/tabs/LoanAnalysisTab.tsx
git commit -m "feat(analytics): add Loan Analysis tab"
```

---

## Task 6: Stock Movements Tab

**Files:**
- Create: `frontend/src/pages/Analytics/tabs/StockMovementsTab.tsx`

4 transaction count cards, horizontal BarChart of units moved per type, recent movements table.

- [ ] **Step 1: Create `frontend/src/pages/Analytics/tabs/StockMovementsTab.tsx`**

```typescript
import { Row, Col, Card, Statistic, Table, Tag, Typography, Flex } from 'antd';
import {
  ShoppingCartOutlined, ExportOutlined, ImportOutlined, DeleteOutlined,
} from '@ant-design/icons';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import type { MovementSummary, RecentMovement } from '../../../api/reports';

const { Text } = Typography;

interface Props {
  movements: MovementSummary[];
  recentMovements: RecentMovement[];
}

const MOVEMENT_COLOR: Record<string, string> = {
  purchase:    '#1677ff',
  loan_out:    '#722ed1',
  loan_return: '#52c41a',
  write_off:   '#ff4d4f',
  adjustment:  '#fa8c16',
};

const MOVEMENT_LABEL: Record<string, string> = {
  purchase:    'Purchase',
  loan_out:    'Loan Out',
  loan_return: 'Loan Return',
  write_off:   'Write-off',
  adjustment:  'Adjustment',
};

export default function StockMovementsTab({ movements, recentMovements }: Props) {
  const byType = (type: string) => movements.find(m => m.type === type);

  const summaryCards = [
    { title: 'Purchases',    value: byType('purchase')?.count    ?? 0, icon: <ShoppingCartOutlined style={{ fontSize: 22, color: '#1677ff' }} />, color: '#e6f4ff' },
    { title: 'Loans Out',    value: byType('loan_out')?.count    ?? 0, icon: <ExportOutlined       style={{ fontSize: 22, color: '#722ed1' }} />, color: '#f9f0ff' },
    { title: 'Loan Returns', value: byType('loan_return')?.count ?? 0, icon: <ImportOutlined       style={{ fontSize: 22, color: '#52c41a' }} />, color: '#f6ffed' },
    { title: 'Write-offs',   value: byType('write_off')?.count   ?? 0, icon: <DeleteOutlined       style={{ fontSize: 22, color: '#ff4d4f' }} />, color: '#fff1f0' },
  ];

  const chartData = movements.map(m => ({
    type: MOVEMENT_LABEL[m.type] ?? m.type,
    units: m.total_units,
    rawType: m.type,
  }));

  const recentColumns = [
    { title: 'Asset', dataIndex: 'asset_type_name', key: 'asset_type_name' },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type: string) => (
        <Tag color={MOVEMENT_COLOR[type] ?? 'default'}>
          {MOVEMENT_LABEL[type] ?? type}
        </Tag>
      ),
    },
    {
      title: 'Δ Qty',
      dataIndex: 'quantity_delta',
      key: 'quantity_delta',
      width: 70,
      render: (v: number) => (
        <Text style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f' }}>
          {v >= 0 ? `+${v}` : v}
        </Text>
      ),
    },
    {
      title: 'Date',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 100,
      render: (v: string) => new Date(v).toLocaleDateString(),
    },
  ];

  return (
    <div>
      <Row gutter={[12, 12]} style={{ marginBottom: 24 }}>
        {summaryCards.map(card => (
          <Col xs={12} sm={6} key={card.title}>
            <Card style={{ borderRadius: 12, border: 'none' }} styles={{ body: { padding: 20 } }}>
              <Flex align="flex-start" gap={16}>
                <div style={{
                  width: 48, height: 48, background: card.color, borderRadius: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {card.icon}
                </div>
                <div>
                  <Text style={{ fontSize: 13, color: '#8c8c8c', display: 'block' }}>{card.title}</Text>
                  <Statistic value={card.value} valueStyle={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2 }} />
                </div>
              </Flex>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Units Moved by Type" style={{ borderRadius: 12, border: 'none' }}>
            {chartData.length === 0 ? (
              <Text type="secondary">No movement data</Text>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 4, right: 24, left: 80, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="type" tick={{ fontSize: 13 }} width={80} />
                  <Tooltip />
                  <Bar dataKey="units" radius={[0, 4, 4, 0]} name="Units">
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={MOVEMENT_COLOR[entry.rawType] ?? '#8c8c8c'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Recent Movements" style={{ borderRadius: 12, border: 'none' }}>
            <Table<RecentMovement>
              dataSource={recentMovements}
              columns={recentColumns}
              rowKey="id"
              pagination={false}
              size="small"
              scroll={{ x: 380 }}
              locale={{ emptyText: 'No recent movements' }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock/frontend && npm run build 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock && git add frontend/src/pages/Analytics/tabs/StockMovementsTab.tsx
git commit -m "feat(analytics): add Stock Movements tab"
```

---

## Task 7: Analytics Page Shell

**Files:**
- Modify: `frontend/src/pages/Analytics/index.tsx` (replace placeholder)

Wires all tabs together: role guard, parallel data fetch, tab layout with Alerts badge.

- [ ] **Step 1: Replace `frontend/src/pages/Analytics/index.tsx`**

```typescript
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, Badge, Spin, Flex, Alert, Typography } from 'antd';
import { useAuth } from '../../contexts/AuthContext';
import {
  getSummary, getDepreciation, getAlerts, getLoanUsage, getMovements, getRecentMovements,
  type SummaryReport, type DepreciationReport, type AlertsReport,
  type LoanUsageReport, type MovementSummary, type RecentMovement,
} from '../../api/reports';
import { getMyClub, type Club } from '../../api/clubs';
import OverviewTab from './tabs/OverviewTab';
import AlertsTab from './tabs/AlertsTab';
import LoanAnalysisTab from './tabs/LoanAnalysisTab';
import StockMovementsTab from './tabs/StockMovementsTab';

const { Title } = Typography;

interface PageData {
  summary: SummaryReport;
  depreciation: DepreciationReport;
  alerts: AlertsReport;
  loanUsage: LoanUsageReport;
  movements: MovementSummary[];
  recentMovements: RecentMovement[];
  club: Club;
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== 'club_admin' && user.role !== 'asset_manager') {
      navigate('/dashboard', { replace: true });
      return;
    }

    async function load() {
      try {
        const [summary, depreciation, alerts, loanUsage, movements, recentMovements, clubRes] =
          await Promise.all([
            getSummary(),
            getDepreciation(),
            getAlerts(),
            getLoanUsage(),
            getMovements(),
            getRecentMovements(),
            getMyClub(),
          ]);
        setData({
          summary, depreciation, alerts, loanUsage, movements, recentMovements,
          club: clubRes.data,
        });
      } catch {
        setError('Failed to load analytics data. Please refresh the page.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, navigate]);

  if (loading) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: 300 }}>
        <Spin size="large" />
      </Flex>
    );
  }

  if (error || !data) {
    return <Alert type="error" message={error ?? 'Unknown error'} />;
  }

  const tabItems = [
    {
      key: 'overview',
      label: 'Overview',
      children: <OverviewTab summary={data.summary} depreciation={data.depreciation} />,
    },
    {
      key: 'alerts',
      label: (
        <Badge count={data.alerts.total_alert_count} size="small" offset={[6, -2]}>
          <span style={{ paddingRight: 6 }}>Alerts</span>
        </Badge>
      ),
      children: (
        <AlertsTab
          alerts={data.alerts}
          club={{
            retirement_alert_mode:  data.club.retirement_alert_mode,
            retirement_alert_value: data.club.retirement_alert_value,
            low_stock_threshold:    data.club.low_stock_threshold,
          }}
        />
      ),
    },
    {
      key: 'loans',
      label: 'Loan Analysis',
      children: <LoanAnalysisTab loanUsage={data.loanUsage} />,
    },
    {
      key: 'movements',
      label: 'Stock Movements',
      children: <StockMovementsTab movements={data.movements} recentMovements={data.recentMovements} />,
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 20, marginTop: 0 }}>Analytics</Title>
      <Tabs items={tabItems} defaultActiveKey="overview" />
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock/frontend && npm run build 2>&1 | tail -10
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock && git add frontend/src/pages/Analytics/index.tsx
git commit -m "feat(analytics): wire up Analytics page with role guard and 4 tabs"
```

---

## Task 8: Club Profile — Analytics Alert Thresholds

**Files:**
- Modify: `frontend/src/pages/ClubProfile/index.tsx`

Append "Analytics Alert Thresholds" section. This section is always visible but only editable by `club_admin`. It shares the existing `editing` state and `Save Changes` button — both sections save together in one PUT call.

The current `ClubProfile/index.tsx` is 135 lines. Key variables:
- `club` — `Club | null` loaded from `getMyClub()`
- `editing` — boolean, toggled by Edit / Cancel buttons
- `isAdmin` — `user?.role === 'club_admin'`
- `handleSave(values)` — calls `updateMyClub(values)`, sets `club` from response

- [ ] **Step 1: Rewrite `frontend/src/pages/ClubProfile/index.tsx`**

```typescript
import { useEffect, useState } from 'react';
import {
  Card, Descriptions, Form, Input, Select, Button, Typography,
  Flex, Spin, App, Radio, InputNumber,
} from 'antd';
import { EditOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import { getMyClub, updateMyClub, type Club } from '../../api/clubs';

const { Title, Text } = Typography;

const SPORT_TYPES = [
  'Football', 'Basketball', 'Swimming', 'Tennis', 'Volleyball',
  'Baseball', 'Rugby', 'Hockey', 'Athletics', 'Other',
];

export default function ClubProfilePage() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const isAdmin = user?.role === 'club_admin';

  const [club, setClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Alert threshold state — synced from club on load and on startEdit
  const [alertMode, setAlertMode] = useState<'months' | 'percent'>('percent');
  const [alertValue, setAlertValue] = useState<number>(80);

  useEffect(() => {
    getMyClub()
      .then(res => {
        setClub(res.data);
        setAlertMode(res.data.retirement_alert_mode ?? 'percent');
        setAlertValue(res.data.retirement_alert_value ?? 80);
      })
      .catch(() => message.error('Failed to load club info'))
      .finally(() => setLoading(false));
  }, [message]);

  function startEdit() {
    if (!club) return;
    form.setFieldsValue({
      name: club.name,
      sport_type: club.sport_type,
      contact_email: club.contact_email,
      address: club.address ?? '',
    });
    setAlertMode(club.retirement_alert_mode ?? 'percent');
    setAlertValue(club.retirement_alert_value ?? 80);
    setEditing(true);
  }

  function cancelEdit() {
    form.resetFields();
    if (club) {
      setAlertMode(club.retirement_alert_mode ?? 'percent');
      setAlertValue(club.retirement_alert_value ?? 80);
    }
    setEditing(false);
  }

  async function handleSave(values: {
    name: string;
    sport_type: string;
    contact_email: string;
    address?: string;
  }) {
    setSaving(true);
    try {
      const res = await updateMyClub({
        ...values,
        retirement_alert_mode:  alertMode,
        retirement_alert_value: alertValue,
      });
      setClub(res.data);
      setEditing(false);
      message.success('Club profile updated');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Failed to save changes';
      message.error(msg);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: 300 }}>
        <Spin size="large" />
      </Flex>
    );
  }

  const alertModeLabel = alertMode === 'percent' ? 'Life elapsed (%)' : 'Remaining life (months)';
  const alertSummary =
    alertMode === 'percent'
      ? `Alert when ≥ ${alertValue}% of useful life has elapsed`
      : `Alert when ≤ ${alertValue} months of useful life remain`;

  return (
    <div style={{ maxWidth: 720 }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>Club Profile</Title>
        {isAdmin && !editing && (
          <Button icon={<EditOutlined />} onClick={startEdit}>Edit</Button>
        )}
      </Flex>

      {/* Club info card */}
      <Card style={{ borderRadius: 12, border: 'none' }}>
        {editing ? (
          <Form form={form} layout="vertical" onFinish={handleSave}>
            <Form.Item
              name="name" label="Club Name"
              rules={[{ required: true, message: 'Club name is required' }]}
            >
              <Input />
            </Form.Item>

            <Form.Item
              name="sport_type" label="Sport Type"
              rules={[{ required: true, message: 'Sport type is required' }]}
            >
              <Select options={SPORT_TYPES.map(s => ({ value: s, label: s }))} />
            </Form.Item>

            <Form.Item
              name="contact_email" label="Contact Email"
              rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
            >
              <Input />
            </Form.Item>

            <Form.Item name="address" label="Address">
              <Input placeholder="City, Country" />
            </Form.Item>

            <Flex gap={8}>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
                Save Changes
              </Button>
              <Button icon={<CloseOutlined />} onClick={cancelEdit} disabled={saving}>
                Cancel
              </Button>
            </Flex>
          </Form>
        ) : (
          <Descriptions column={1} size="middle" bordered={false}>
            <Descriptions.Item label="Club Name">{club?.name ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Sport Type">{club?.sport_type ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Contact Email">{club?.contact_email ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Address">{club?.address || '—'}</Descriptions.Item>
            <Descriptions.Item label="Member Since">
              {club?.created_at ? new Date(club.created_at).toLocaleDateString() : '—'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      {/* Analytics Alert Thresholds card */}
      <Card
        title="Analytics Alert Thresholds"
        style={{ marginTop: 24, borderRadius: 12, border: 'none' }}
      >
        {editing ? (
          <div>
            <Text style={{ display: 'block', fontWeight: 500, marginBottom: 8 }}>
              Retirement Alert Trigger
            </Text>
            <Radio.Group
              value={alertMode}
              onChange={e => setAlertMode(e.target.value as 'months' | 'percent')}
              style={{ marginBottom: 16 }}
            >
              <Radio value="percent">Life elapsed (%)</Radio>
              <Radio value="months">Remaining life (months)</Radio>
            </Radio.Group>
            <Flex align="center" gap={8}>
              <Text>
                {alertMode === 'percent' ? 'Alert when life elapsed ≥' : 'Alert when remaining months ≤'}
              </Text>
              <InputNumber
                min={1}
                max={alertMode === 'percent' ? 100 : 120}
                value={alertValue}
                onChange={v => setAlertValue(v ?? 1)}
                addonAfter={alertMode === 'percent' ? '%' : 'months'}
                style={{ width: 160 }}
              />
            </Flex>
          </div>
        ) : (
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Retirement Alert Mode">{alertModeLabel}</Descriptions.Item>
            <Descriptions.Item label="Threshold">{alertSummary}</Descriptions.Item>
            <Descriptions.Item label="Low Stock Default">
              {club?.low_stock_threshold ?? 2} units
            </Descriptions.Item>
          </Descriptions>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock/frontend && npm run build 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock && git add frontend/src/pages/ClubProfile/index.tsx
git commit -m "feat(club-profile): add Analytics Alert Thresholds settings section"
```

---

## Final Verification

- [ ] **Confirm clean build**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock/frontend && npm run build 2>&1 | grep -E "error TS|built in"
```

Expected: `built in` line, zero `error TS` lines.

- [ ] **Visual verification checklist (manual, run `npm run dev` and open browser)**

1. Log in as `asset_manager` → "Analytics" appears in sidebar between Write-offs and Users
2. Log in as `club_admin` → same
3. Log in as `coach` → "Analytics" not in sidebar; navigating to `/dashboard/analytics` redirects to `/dashboard`
4. Analytics → Overview tab: 5 status cards, 3 financial cards, 2 charts
5. Analytics → Alerts tab: badge shows total alert count; both tables render; "Edit in Settings" link navigates to Club Profile
6. Analytics → Loan Analysis tab: area chart, top assets list, coach table
7. Analytics → Stock Movements tab: 4 summary cards, horizontal bar chart, recent table
8. Club Profile: "Analytics Alert Thresholds" section appears; admin can switch modes and save; values persist after page reload
