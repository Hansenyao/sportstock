import { Row, Col, Card, Statistic, Table, Tag, Typography, Flex } from 'antd';
import {
  ShoppingCartOutlined, ExportOutlined, ImportOutlined, DeleteOutlined,
} from '@ant-design/icons';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import type { TableProps } from 'antd';
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

  const recentColumns: TableProps<RecentMovement>['columns'] = [
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
                    {chartData.map((entry) => (
                      <Cell key={entry.rawType} fill={MOVEMENT_COLOR[entry.rawType] ?? '#8c8c8c'} />
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
