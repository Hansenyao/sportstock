// frontend/src/admin/pages/Analytics/index.tsx
import { useEffect, useState } from 'react';
import { Tabs, Card, Row, Col, Statistic, Typography, Spin, App, Table } from 'antd';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  getAnalyticsOverview, getAnalyticsLoans,
  getAnalyticsAssets, getAnalyticsGrowth,
} from '../../api/admin';

const { Title } = Typography;
const COLORS = ['#1668dc', '#52c41a', '#faad14', '#ff4d4f', '#722ed1'];

export default function AdminAnalyticsPage() {
  const { message } = App.useApp();
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [loans,    setLoans]    = useState<Record<string, unknown> | null>(null);
  const [assets,   setAssets]   = useState<Record<string, unknown> | null>(null);
  const [growth,   setGrowth]   = useState<Record<string, unknown> | null>(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      getAnalyticsOverview(), getAnalyticsLoans(),
      getAnalyticsAssets(),   getAnalyticsGrowth(),
    ])
      .then(([o, l, a, g]) => {
        if (!active) return;
        setOverview(o); setLoans(l); setAssets(a); setGrowth(g);
      })
      .catch(() => message.error('Failed to load analytics'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Spin style={{ display: 'block', margin: '80px auto' }} />;

  const overviewTab = (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        {[
          { label: 'Total Clubs',  value: overview?.total_clubs,  color: '#1668dc' },
          { label: 'Active Clubs', value: overview?.active_clubs, color: '#52c41a' },
          { label: 'Total Users',  value: overview?.total_users,  color: '#faad14' },
          { label: 'Total Assets', value: overview?.total_assets, color: '#722ed1' },
          { label: 'Active Loans', value: overview?.active_loans, color: '#13c2c2' },
          { label: 'Overdue Loans',value: overview?.overdue_loans,color: '#ff4d4f' },
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
        ))}
      </Row>
      <Card title={<span style={{ color: '#aaa' }}>Asset Distribution by Status</span>}
            style={{ background: '#1a1a1a', border: '1px solid #252525' }}>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={(overview?.asset_by_status as { status: string; total: number }[]) ?? []}
              dataKey="total" nameKey="status" cx="50%" cy="50%" outerRadius={80}
              label={({ status, total }) => `${status}: ${total}`}
            >
              {((overview?.asset_by_status as { status: string }[]) ?? []).map((_e, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );

  const loanTab = (
    <div>
      <Card title={<span style={{ color: '#aaa' }}>Monthly Loan Count (last 12 months)</span>}
            style={{ background: '#1a1a1a', border: '1px solid #252525', marginBottom: 16 }}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={(loans?.monthly_trend as object[]) ?? []}>
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
          dataSource={(loans?.top_assets as object[]) ?? []}
          rowKey="asset_name"
          size="small"
          pagination={false}
          columns={[
            { title: 'Asset', dataIndex: 'asset_name', key: 'asset_name' },
            { title: 'Loan Count', dataIndex: 'loan_count', key: 'loan_count' },
          ]}
        />
      </Card>
    </div>
  );

  const assetTab = (
    <div>
      <Card title={<span style={{ color: '#aaa' }}>Assets by Category</span>}
            style={{ background: '#1a1a1a', border: '1px solid #252525', marginBottom: 16 }}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={(assets?.by_category as object[]) ?? []}>
            <XAxis dataKey="category" tick={{ fill: '#555', fontSize: 11 }} />
            <YAxis tick={{ fill: '#555', fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="total_qty" fill="#1668dc" name="Qty" />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );

  const growthTab = (
    <Card title={<span style={{ color: '#aaa' }}>Club & User Growth (last 12 months)</span>}
          style={{ background: '#1a1a1a', border: '1px solid #252525' }}>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart>
          <XAxis dataKey="month" tick={{ fill: '#555', fontSize: 11 }} />
          <YAxis tick={{ fill: '#555', fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Line data={(growth?.clubs as object[]) ?? []} type="monotone" dataKey="new_clubs" stroke="#1668dc" name="New Clubs" dot={false} />
          <Line data={(growth?.users as object[]) ?? []} type="monotone" dataKey="new_users" stroke="#52c41a" name="New Users" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );

  return (
    <div>
      <Title level={4} style={{ color: '#fff', marginBottom: 24 }}>Platform Analytics</Title>
      <Tabs
        items={[
          { key: 'overview', label: 'Overview',       children: overviewTab },
          { key: 'loans',    label: 'Loan Analysis',  children: loanTab },
          { key: 'assets',   label: 'Asset Analysis', children: assetTab },
          { key: 'growth',   label: 'Growth Trends',  children: growthTab },
        ]}
      />
    </div>
  );
}
