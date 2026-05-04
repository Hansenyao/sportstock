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
          <Statistic value={value} styles={{ content: { fontSize: 24, fontWeight: 700, lineHeight: 1.2 } }} />
        </div>
      </Flex>
    </Card>
  );
}

export default function OverviewTab({ summary, depreciation }: Props) {
  const originalValue = summary.total_purchase_value;
  const netValue = Number(depreciation.summary.total_net_book_value);
  const depRate = originalValue > 0
    ? Math.min(100, Math.max(0, Math.round(((originalValue - netValue) / originalValue) * 100)))
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
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
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
