import { Table, Progress, Tag, Typography, Space, Card, Flex } from 'antd';
import { WarningOutlined, SettingOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { AlertsReport, RetirementRiskItem, LowStockItem } from '../../../api/reports';

const { Text, Link } = Typography;

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
        <Flex vertical gap={2} style={{ width: '100%' }}>
          <Progress
            percent={Math.min(row.life_used_percent, 100)}
            strokeColor={row.life_used_percent >= 90 ? '#ff4d4f' : '#fa8c16'}
            size="small"
            showInfo={false}
          />
          <Text style={{ fontSize: 12 }}>{Math.round(row.life_used_percent)}%</Text>
        </Flex>
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
