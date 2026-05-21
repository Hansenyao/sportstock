// frontend/src/admin/pages/Dashboard/index.tsx
import { useEffect, useState } from 'react';
import { Row, Col, Statistic, Card, Table, Tag, Typography, Spin, App } from 'antd';
import { BankOutlined, TeamOutlined, InboxOutlined, SwapOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getStats, listClubs } from '../../api/admin';
import type { PlatformStats, ClubListItem } from '../../api/admin';

const { Title } = Typography;

export default function AdminDashboardPage() {
  const { message } = App.useApp();
  const navigate    = useNavigate();
  const [stats,     setStats]     = useState<PlatformStats | null>(null);
  const [clubs,     setClubs]     = useState<ClubListItem[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([getStats(), listClubs({ page: 1, limit: 5 })])
      .then(([s, c]) => {
        if (!active) return;
        setStats(s);
        setClubs(c.data);
      })
      .catch(() => message.error('Failed to load dashboard data'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Spin style={{ display: 'block', margin: '80px auto' }} />;

  const columns = [
    { title: 'Club', dataIndex: 'name', key: 'name',
      render: (name: string, r: ClubListItem) => (
        <a onClick={() => navigate(`/admin/clubs/${r.id}`)} style={{ color: '#1668dc' }}>{name}</a>
      ) },
    { title: 'Users',        dataIndex: 'user_count',        key: 'user_count' },
    { title: 'Assets',       dataIndex: 'asset_count',       key: 'asset_count' },
    { title: 'Active Loans', dataIndex: 'active_loan_count', key: 'active_loan_count' },
    { title: 'Status', dataIndex: 'is_active', key: 'is_active',
      render: (v: boolean) => <Tag color={v ? 'success' : 'error'}>{v ? 'Active' : 'Disabled'}</Tag> },
  ];

  return (
    <div>
      <Title level={4} style={{ color: '#fff', marginBottom: 24 }}>Dashboard</Title>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        {[
          { title: 'Total Clubs',    value: stats?.total_clubs,   icon: <BankOutlined />,   color: '#1668dc' },
          { title: 'Total Users',    value: stats?.total_users,   icon: <TeamOutlined />,   color: '#52c41a' },
          { title: 'Total Assets',   value: stats?.total_assets,  icon: <InboxOutlined />,  color: '#faad14' },
          { title: 'Overdue Loans',  value: stats?.overdue_loans, icon: <SwapOutlined />,   color: '#ff4d4f' },
        ].map(item => (
          <Col xs={12} sm={6} key={item.title}>
            <Card style={{ background: '#1a1a1a', border: '1px solid #252525' }}>
              <Statistic
                title={<span style={{ color: '#555', fontSize: 12 }}>{item.title}</span>}
                value={item.value ?? 0}
                valueStyle={{ color: item.color }}
                prefix={item.icon}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Card
        title={<span style={{ color: '#aaa' }}>Recent Clubs</span>}
        extra={<a onClick={() => navigate('/admin/clubs')} style={{ color: '#1668dc', fontSize: 12 }}>View all</a>}
        style={{ background: '#1a1a1a', border: '1px solid #252525' }}
      >
        <Table
          dataSource={clubs}
          columns={columns}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </Card>
    </div>
  );
}
