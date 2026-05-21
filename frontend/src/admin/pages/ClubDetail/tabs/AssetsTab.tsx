// frontend/src/admin/pages/ClubDetail/tabs/AssetsTab.tsx
import { useEffect, useState, useCallback } from 'react';
import { Table, Tag, Button, Space, App, Typography, Avatar, Flex, Input, Select, Tooltip } from 'antd';
import {
  ExclamationCircleOutlined, PictureOutlined, SearchOutlined,
  StopOutlined, CheckCircleOutlined, DeleteOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { listClubAssets, updateAssetStatus, deleteAsset } from '../../../api/admin';

const { Text } = Typography;

interface AssetBatch {
  id: string;
  purchase_date: string | null;
  purchase_price: number | null;
  total_quantity: number;
  available_quantity: number;
  status: string;
}

interface Asset {
  id: string;
  name: string;
  category_name: string | null;
  brand: string | null;
  model: string | null;
  size: string | null;
  image_url: string | null;
  is_active: boolean;
  total_quantity: number;
  available_quantity: number;
  batch_count: number;
  status: string;
  batches: AssetBatch[];
}

const STATUS_COLOR: Record<string, string> = {
  available: 'success', on_loan: 'processing', maintenance: 'warning', retired: 'default',
};
const STATUS_LABEL: Record<string, string> = {
  available: 'Available', on_loan: 'On Loan', maintenance: 'Maintenance', retired: 'Retired',
};

export default function AssetsTab({ clubId }: { clubId: string }) {
  const { message, modal } = App.useApp();
  const [data,         setData]         = useState<Asset[]>([]);
  const [total,        setTotal]        = useState(0);
  const [page,         setPage]         = useState(1);
  const [loading,      setLoading]      = useState(false);
  const [search,       setSearch]       = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [expandedRows, setExpandedRows] = useState<string[]>([]);

  const fetch = useCallback(async (p: number, s?: string, st?: string) => {
    setLoading(true);
    try {
      const res = await listClubAssets(clubId, { page: p, limit: 20, search: s, status: st });
      setData(res.data as unknown as Asset[]);
      setTotal(res.total);
    } catch { message.error('Failed to load assets'); }
    finally { setLoading(false); }
  }, [clubId, message]);

  useEffect(() => { fetch(page, search, statusFilter); }, [page, search, statusFilter, fetch]);

  const handleToggleActive = (asset: Asset) => {
    const enabling = !asset.is_active;
    modal.confirm({
      title: enabling ? 'Enable Asset' : 'Disable Asset',
      icon: <ExclamationCircleOutlined />,
      content: enabling
        ? `Re-enable "${asset.name}"? It will become visible to club members again.`
        : `Disable "${asset.name}"? Club members will no longer see it or its quantities.`,
      okText: enabling ? 'Enable' : 'Disable',
      okButtonProps: { danger: !enabling },
      onOk: async () => {
        try {
          await updateAssetStatus(clubId, asset.id, enabling);
          message.success(`Asset ${enabling ? 'enabled' : 'disabled'}`);
          fetch(page, search, statusFilter);
        } catch { message.error(`Failed to ${enabling ? 'enable' : 'disable'} asset`); }
      },
    });
  };

  const handleDelete = (asset: Asset) => {
    modal.confirm({
      title: 'Delete Asset',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <Text>Permanently delete <Text strong>"{asset.name}"</Text>?</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            All batches will be removed. Stock movement records will lose the asset reference.
            This cannot be undone.
          </Text>
        </div>
      ),
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteAsset(clubId, asset.id);
          message.success('Asset deleted');
          fetch(page, search, statusFilter);
        } catch { message.error('Failed to delete asset'); }
      },
    });
  };

  // ── Expanded row: batch details ───────────────────────────────────────────────

  function renderExpandedRow(asset: Asset) {
    if (!asset.batches?.length) {
      return <Text type="secondary" style={{ paddingLeft: 52, display: 'block', paddingBottom: 8 }}>No batches</Text>;
    }
    const batchCols: ColumnsType<AssetBatch> = [
      {
        title: 'Purchase Date',
        dataIndex: 'purchase_date',
        key: 'purchase_date',
        render: (d: string | null) => d
          ? new Date(d).toLocaleDateString()
          : <Text type="secondary">—</Text>,
      },
      {
        title: 'Price',
        dataIndex: 'purchase_price',
        key: 'purchase_price',
        width: 90,
        render: (p: number | null) => p != null
          ? <Text>${Number(p).toFixed(2)}</Text>
          : <Text type="secondary">—</Text>,
      },
      {
        title: 'Qty (avail / total)',
        key: 'qty',
        width: 150,
        render: (_: unknown, b: AssetBatch) => (
          <span>
            <Text strong style={{ color: b.available_quantity === 0 ? '#ff4d4f' : undefined }}>
              {b.available_quantity}
            </Text>
            <Text type="secondary"> / {b.total_quantity}</Text>
          </span>
        ),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        width: 110,
        render: (s: string) => (
          <Tag color={STATUS_COLOR[s] ?? 'default'} style={{ fontSize: 11 }}>
            {STATUS_LABEL[s] ?? s}
          </Tag>
        ),
      },
    ];
    return (
      <div style={{ padding: '4px 0 12px 52px' }}>
        <Table
          dataSource={asset.batches}
          columns={batchCols}
          rowKey="id"
          size="small"
          pagination={false}
          style={{ maxWidth: 640 }}
        />
      </div>
    );
  }

  // ── Main columns ──────────────────────────────────────────────────────────────

  const columns: ColumnsType<Asset> = [
    {
      title: 'Asset',
      key: 'asset',
      render: (_: unknown, r: Asset) => (
        <Flex align="center" gap={10} style={{ opacity: r.is_active ? 1 : 0.45 }}>
          {r.image_url ? (
            <Avatar shape="square" size={40} src={r.image_url} />
          ) : (
            <Avatar shape="square" size={40} icon={<PictureOutlined />}
              style={{ background: '#2a2a2a', color: '#555' }} />
          )}
          <div>
            <Space size={6}>
              <Text strong style={{ display: 'block' }}>{r.name}</Text>
              {!r.is_active && <Tag color="error" style={{ fontSize: 11 }}>Disabled</Tag>}
            </Space>
            <Space size={4}>
              {r.category_name && (
                <Text style={{ fontSize: 12, color: '#8c8c8c' }}>{r.category_name}</Text>
              )}
              {r.size && (
                <Text style={{ fontSize: 12, color: '#1677ff' }}>{r.size}</Text>
              )}
            </Space>
          </div>
        </Flex>
      ),
    },
    {
      title: 'Brand / Model',
      key: 'brand',
      responsive: ['md'] as ('md')[],
      render: (_: unknown, r: Asset) => (
        <Text style={{ color: '#8c8c8c', opacity: r.is_active ? 1 : 0.45 }}>
          {[r.brand, r.model].filter(Boolean).join(' · ') || '—'}
        </Text>
      ),
    },
    {
      title: 'Qty',
      key: 'qty',
      width: 110,
      render: (_: unknown, r: Asset) => (
        <div style={{ opacity: r.is_active ? 1 : 0.45 }}>
          <Text strong style={{ color: r.available_quantity === 0 ? '#ff4d4f' : 'inherit' }}>
            {r.available_quantity}
          </Text>
          <Text style={{ color: '#8c8c8c' }}> / {r.total_quantity}</Text>
          {Number(r.batch_count) > 1 && (
            <Text style={{ fontSize: 11, color: '#8c8c8c', display: 'block' }}>
              {r.batch_count} batches
            </Text>
          )}
        </div>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 120,
      render: (_: unknown, r: Asset) => (
        <Tag color={STATUS_COLOR[r.status] ?? 'default'} style={{ opacity: r.is_active ? 1 : 0.45 }}>
          {STATUS_LABEL[r.status] ?? r.status}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 90,
      render: (_: unknown, r: Asset) => (
        <Space size={4}>
          <Tooltip title={r.is_active ? 'Disable' : 'Enable'}>
            <Button
              type="text" size="small"
              icon={r.is_active ? <StopOutlined /> : <CheckCircleOutlined />}
              style={{ color: r.is_active ? '#faad14' : '#52c41a' }}
              onClick={() => handleToggleActive(r)}
            />
          </Tooltip>
          <Tooltip title="Delete">
            <Button type="text" size="small" icon={<DeleteOutlined />} danger
              onClick={() => handleDelete(r)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Input
          placeholder="Search by name…"
          prefix={<SearchOutlined style={{ color: '#555' }} />}
          allowClear
          style={{ width: 200 }}
          onChange={e => { setSearch(e.target.value || undefined); setPage(1); }}
        />
        <Select
          placeholder="All statuses"
          allowClear
          style={{ width: 150 }}
          onChange={(v: string | undefined) => { setStatusFilter(v); setPage(1); }}
          options={[
            { value: 'available',   label: 'Available' },
            { value: 'on_loan',     label: 'On Loan' },
            { value: 'maintenance', label: 'Maintenance' },
            { value: 'retired',     label: 'Retired' },
          ]}
        />
      </Space>
      <Table
        dataSource={data}
        columns={columns}
        rowKey="id"
        loading={loading}
        scroll={{ x: 500 }}
        expandable={{
          expandedRowKeys: expandedRows,
          onExpand: (expanded, record) => setExpandedRows(expanded ? [record.id] : []),
          expandedRowRender: renderExpandedRow,
        }}
        pagination={{
          current: page,
          pageSize: 20,
          total,
          showTotal: t => `${t} assets`,
          onChange: setPage,
          showSizeChanger: false,
        }}
        size="small"
      />
    </div>
  );
}
