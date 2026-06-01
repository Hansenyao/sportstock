import { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Table, Tag, Typography, Flex, Empty, Spin } from 'antd';
import {
  DatabaseOutlined, CheckCircleOutlined, SwapOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { listAssets } from '../../api/assets';
import { listLoans, type Loan, type LoanStatus } from '../../api/loans';

const { Title, Text } = Typography;

const LOAN_STATUS_COLOR: Record<LoanStatus, string> = {
  pending: 'orange',
  approved: 'blue',
  rejected: 'red',
  checked_out: 'purple',
  returned: 'green',
};

interface Stats {
  totalAssets: number;
  available: number;
  onLoan: number;
  pendingRequests: number;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentLoans, setRecentLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [totalRes, availableRes, onLoanRes, pendingRes] = await Promise.all([
          listAssets({ limit: 1 }),
          listAssets({ status: 'available', limit: 1 }),
          listAssets({ status: 'on_loan', limit: 1 }),
          listLoans({ status: 'pending', limit: 5 }),
        ]);
        setStats({
          totalAssets: totalRes.data.total,
          available: availableRes.data.total,
          onLoan: onLoanRes.data.total,
          pendingRequests: pendingRes.data.total,
        });
        setRecentLoans(pendingRes.data.data);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const statCards = [
    {
      title: 'Total Assets',
      value: stats?.totalAssets,
      icon: <DatabaseOutlined style={{ fontSize: 28, color: '#1677ff' }} />,
      color: '#e6f4ff',
      onClick: () => navigate('/dashboard/assets'),
    },
    {
      title: 'Available',
      value: stats?.available,
      icon: <CheckCircleOutlined style={{ fontSize: 28, color: '#52c41a' }} />,
      color: '#f6ffed',
      onClick: () => navigate('/dashboard/assets'),
    },
    {
      title: 'On Loan',
      value: stats?.onLoan,
      icon: <SwapOutlined style={{ fontSize: 28, color: '#722ed1' }} />,
      color: '#f9f0ff',
      onClick: () => navigate('/dashboard/loans'),
    },
    {
      title: 'Pending Requests',
      value: stats?.pendingRequests,
      icon: <ClockCircleOutlined style={{ fontSize: 28, color: '#fa8c16' }} />,
      color: '#fff7e6',
      onClick: () => navigate('/dashboard/loans'),
    },
  ];

  const loanColumns = [
    {
      title: 'Items',
      key: 'items',
      render: (_: unknown, loan: Loan) => {
        const first = loan.items?.[0];
        const extra = (loan.items?.length ?? 0) - 1;
        return (
          <div>
            <Text strong style={{ fontSize: 13 }}>
              {first?.asset_name ?? '—'}
              {extra > 0 && <Text style={{ color: '#8c8c8c', fontWeight: 400 }}> +{extra} more</Text>}
            </Text>
          </div>
        );
      },
    },
    {
      title: 'Borrower',
      key: 'coach_name',
      ellipsis: true,
      render: (_: unknown, loan: Loan) => (
        <div>
          <Text style={{ fontSize: 13 }}>{loan.coach_name}</Text>
          {loan.created_by_name && loan.created_by_name !== loan.coach_name && (
            <Text style={{ fontSize: 11, color: '#bfbfbf', display: 'block' }}>
              by {loan.created_by_name}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: LoanStatus) => (
        <Tag color={LOAN_STATUS_COLOR[status]}>{status.replace('_', ' ')}</Tag>
      ),
    },
    {
      title: 'Date',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 90,
      render: (v: string) => new Date(v).toLocaleDateString(),
    },
  ];

  if (loading) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: 300 }}>
        <Spin size="large" />
      </Flex>
    );
  }

  return (
    <div>
      <Title level={4} style={{ marginBottom: 20, marginTop: 0 }}>Overview</Title>

      {/* Stat cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {statCards.map((card) => (
          <Col xs={12} sm={12} lg={6} key={card.title}>
            <Card
              hoverable
              onClick={card.onClick}
              style={{ cursor: 'pointer', borderRadius: 12, border: 'none' }}
              styles={{ body: { padding: 20 } }}
            >
              <Flex align="flex-start" gap={16}>
                <div style={{
                  width: 52, height: 52, background: card.color,
                  borderRadius: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {card.icon}
                </div>
                <div>
                  <Text style={{ fontSize: 13, color: '#8c8c8c', display: 'block' }}>{card.title}</Text>
                  <Statistic
                    value={card.value ?? 0}
                    valueStyle={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}
                  />
                </div>
              </Flex>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Recent pending loan requests */}
      <Card
        title="Pending Loan Requests"
        style={{ borderRadius: 12, border: 'none' }}
        extra={
          <Text
            style={{ color: '#1677ff', cursor: 'pointer', fontSize: 13 }}
            onClick={() => navigate('/dashboard/loans')}
          >
            View all
          </Text>
        }
      >
        {recentLoans.length === 0 ? (
          <Empty description="No pending requests" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Table
            dataSource={recentLoans}
            columns={loanColumns}
            rowKey="id"
            pagination={false}
            size="small"
            scroll={{ x: 500 }}
          />
        )}
      </Card>
    </div>
  );
}
