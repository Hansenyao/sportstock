// frontend/src/admin/pages/Analytics/index.tsx
import { useEffect, useState, useCallback } from 'react';
import { Tabs, Card, Row, Col, Statistic, Typography, Spin, App, Table, Select } from 'antd';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  getAnalyticsOverview, getAnalyticsLoans,
  getAnalyticsAssets, getAnalyticsGrowth,
  listClubs,
} from '../../api/admin';
import type { ClubListItem } from '../../api/admin';

const { Title } = Typography;
const COLORS = ['#1668dc', '#52c41a', '#faad14', '#ff4d4f', '#722ed1'];

export default function AdminAnalyticsPage() {
  const { message } = App.useApp();

  const [clubs,    setClubs]   = useState<ClubListItem[]>([]);
  const [clubId,   setClubId]  = useState<string | undefined>(undefined);

  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [loans,    setLoans]    = useState<Record<string, unknown> | null>(null);
  const [assets,   setAssets]   = useState<Record<string, unknown> | null>(null);
  const [growth,   setGrowth]   = useState<Record<string, unknown> | null>(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    listClubs({ limit: 200 })
      .then(r => setClubs(r.data))
      .catch(() => message.error('Failed to load club list'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAnalytics = useCallback((cid: string | undefined) => {
    setLoading(true);
    const reqs = cid
      ? [getAnalyticsOverview(cid), getAnalyticsLoans(cid), getAnalyticsAssets(cid), Promise.resolve(null)]
      : [getAnalyticsOverview(),    getAnalyticsLoans(),    getAnalyticsAssets(),    getAnalyticsGrowth()];
    Promise.all(reqs)
      .then(([o, l, a, g]) => { setOverview(o); setLoans(l); setAssets(a); setGrowth(g); })
      .catch(() => message.error('Failed to load analytics'))
      .finally(() => setLoading(false));
  }, [message]);

  useEffect(() => { fetchAnalytics(clubId); }, [clubId, fetchAnalytics]);

  // ── Overview tab ─────────────────────────────────────────────────────────────

  const overviewTab = overview && (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        {clubId ? (
          [
            { label: 'Users',         value: overview.user_count,    color: '#1668dc' },
            { label: 'Assets',        value: overview.asset_count,   color: '#52c41a' },
            { label: 'Active Loans',  value: overview.active_loans,  color: '#faad14' },
            { label: 'Overdue Loans', value: overview.overdue_loans, color: '#ff4d4f' },
          ].map(s => (
            <Col xs={12} sm={6} key={s.label}>
              <Card size="small" style={{ background: '#1a1a1a', border: '1px solid #252525' }}>
                <Statistic
                  title={<span style={{ color: '#555', fontSize: 11 }}>{s.label}</span>}
                  value={s.value as number ?? 0}
                  valueStyle={{ color: s.color, fontSize: 20 }}
                />
              </Card>
            </Col>
          ))
        ) : (
          [
            { label: 'Total Clubs',   value: overview.total_clubs,   color: '#1668dc' },
            { label: 'Active Clubs',  value: overview.active_clubs,  color: '#52c41a' },
            { label: 'Total Users',   value: overview.total_users,   color: '#faad14' },
            { label: 'Total Assets',  value: overview.total_assets,  color: '#722ed1' },
            { label: 'Active Loans',  value: overview.active_loans,  color: '#13c2c2' },
            { label: 'Overdue Loans', value: overview.overdue_loans, color: '#ff4d4f' },
          ].map(s => (
            <Col xs={12} sm={8} md={4} key={s.label}>
              <Card size="small" style={{ background: '#1a1a1a', border: '1px solid #252525' }}>
                <Statistic
                  title={<span style={{ color: '#555', fontSize: 11 }}>{s.label}</span>}
                  value={s.value as number ?? 0}
                  valueStyle={{ color: s.color, fontSize: 20 }}
                />
              </Card>
            </Col>
          ))
        )}
      </Row>
      <Card title={<span style={{ color: '#aaa' }}>Asset Distribution by Status</span>}
            style={{ background: '#1a1a1a', border: '1px solid #252525' }}>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={(overview.asset_by_status as { status: string; total: number }[]) ?? []}
              dataKey="total" nameKey="status" cx="50%" cy="50%" outerRadius={80}
              label={({ status, total }) => `${status}: ${total}`}
            >
              {((overview.asset_by_status as { status: string }[]) ?? []).map((_e, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );

  // ── Loan Analysis tab ─────────────────────────────────────────────────────────

  const loanTab = loans && (
    <div>
      <Card title={<span style={{ color: '#aaa' }}>Monthly Loan Count (last 12 months)</span>}
            style={{ background: '#1a1a1a', border: '1px solid #252525', marginBottom: 16 }}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={(loans.monthly_trend as object[]) ?? []}>
            <XAxis dataKey="month" tick={{ fill: '#555', fontSize: 11 }} />
            <YAxis tick={{ fill: '#555', fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="loan_count" stroke="#1668dc" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
      <Card title={<span style={{ color: '#aaa' }}>Top 10 Borrowed Assets</span>}
            style={{ background: '#1a1a1a', border: '1px solid #252525' }}>
        <Table
          dataSource={(loans.top_assets as object[]) ?? []}
          rowKey="asset_name"
          size="small"
          pagination={false}
          columns={[
            { title: 'Asset',      dataIndex: 'asset_name', key: 'asset_name' },
            { title: 'Loan Count', dataIndex: 'loan_count', key: 'loan_count' },
          ]}
        />
      </Card>
    </div>
  );

  // ── Asset Analysis tab ────────────────────────────────────────────────────────

  const assetTab = assets && (
    <Card title={<span style={{ color: '#aaa' }}>Assets by Category</span>}
          style={{ background: '#1a1a1a', border: '1px solid #252525' }}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={(assets.by_category as object[]) ?? []}>
          <XAxis dataKey="category" tick={{ fill: '#555', fontSize: 11 }} />
          <YAxis tick={{ fill: '#555', fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="total_qty" fill="#1668dc" name="Qty" />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );

  // ── Growth Trends tab (platform-only) ─────────────────────────────────────────

  const growthTab = (() => {
    if (!growth) return null;
    const clubsArr = (growth.clubs as { month: string; new_clubs: number }[]) ?? [];
    const usersArr = (growth.users as { month: string; new_users: number }[]) ?? [];
    const mergedMap = new Map<string, { month: string; new_clubs: number; new_users: number }>();
    clubsArr.forEach(r => mergedMap.set(r.month, { month: r.month, new_clubs: r.new_clubs, new_users: 0 }));
    usersArr.forEach(r => {
      const existing = mergedMap.get(r.month);
      if (existing) existing.new_users = r.new_users;
      else mergedMap.set(r.month, { month: r.month, new_clubs: 0, new_users: r.new_users });
    });
    const merged = Array.from(mergedMap.values()).sort((a, b) => a.month.localeCompare(b.month));
    return (
      <Card title={<span style={{ color: '#aaa' }}>Club & User Growth (last 12 months)</span>}
            style={{ background: '#1a1a1a', border: '1px solid #252525' }}>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={merged}>
            <XAxis dataKey="month" tick={{ fill: '#555', fontSize: 11 }} />
            <YAxis tick={{ fill: '#555', fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="new_clubs" stroke="#1668dc" name="New Clubs" dot={false} />
            <Line type="monotone" dataKey="new_users" stroke="#52c41a" name="New Users" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    );
  })();

  // ── Tab items ─────────────────────────────────────────────────────────────────

  const spinner = <Spin style={{ display: 'block', margin: '40px auto' }} />;
  const tabItems = [
    { key: 'overview', label: 'Overview',       children: loading ? spinner : overviewTab },
    { key: 'loans',    label: 'Loan Analysis',  children: loading ? spinner : loanTab },
    { key: 'assets',   label: 'Asset Analysis', children: loading ? spinner : assetTab },
    ...(!clubId ? [{ key: 'growth', label: 'Growth Trends', children: loading ? spinner : growthTab }] : []),
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <Title level={4} style={{ color: '#fff', margin: 0 }}>Platform Analytics</Title>
        <Select
          allowClear
          placeholder="All Clubs"
          style={{ width: 240 }}
          onChange={(v: string | undefined) => setClubId(v)}
          options={clubs.map(c => ({ value: c.id, label: c.name }))}
          showSearch
          filterOption={(input, opt) =>
            (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
          }
        />
      </div>
      <Tabs items={tabItems} />
    </div>
  );
}
