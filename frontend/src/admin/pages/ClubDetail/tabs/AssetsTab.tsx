// frontend/src/admin/pages/ClubDetail/tabs/AssetsTab.tsx
import { useEffect, useState, useCallback } from 'react';
import { Table, Tag, Button, Space, App, Typography } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { listClubAssets, retireAsset, deleteAsset } from '../../../api/admin';

const { Text } = Typography;

interface Asset {
  id: string; name: string; brand: string | null; model: string | null;
  size: string | null; total_quantity: number; available_quantity: number;
  status: string; created_at: string;
}

export default function AssetsTab({ clubId }: { clubId: string }) {
  const { message, modal } = App.useApp();
  const [data,    setData]    = useState<Asset[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await listClubAssets(clubId, { page: p, limit: 20 });
      setData(res.data as Asset[]);
      setTotal(res.total);
    } catch { message.error('Failed to load assets'); }
    finally { setLoading(false); }
  }, [clubId, message]);

  useEffect(() => { fetch(page); }, [page, fetch]);

  const handleRetire = (asset: Asset) => {
    modal.confirm({
      title: 'Retire Asset',
      icon: <ExclamationCircleOutlined />,
      content: `Retire all batches of "${asset.name}"? This marks them as unavailable.`,
      okText: 'Retire',
      onOk: async () => {
        await retireAsset(clubId, asset.id);
        message.success('Asset retired');
        fetch(page);
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
        await deleteAsset(clubId, asset.id);
        message.success('Asset deleted');
        fetch(page);
      },
    });
  };

  const statusColor: Record<string, string> = {
    available: 'success', on_loan: 'processing', maintenance: 'warning', retired: 'error',
  };

  const columns = [
    { title: 'Name',  dataIndex: 'name',  key: 'name' },
    { title: 'Brand', dataIndex: 'brand', key: 'brand', render: (v: string | null) => v ?? '—' },
    { title: 'Qty',   dataIndex: 'total_quantity', key: 'total_quantity' },
    { title: 'Available', dataIndex: 'available_quantity', key: 'available_quantity' },
    { title: 'Status', dataIndex: 'status', key: 'status',
      render: (v: string) => <Tag color={statusColor[v] ?? 'default'}>{v}</Tag> },
    { title: 'Actions', key: 'actions',
      render: (_: unknown, r: Asset) => (
        <Space>
          <Button size="small" disabled={r.status === 'retired'} onClick={() => handleRetire(r)}>
            Retire
          </Button>
          <Button size="small" danger onClick={() => handleDelete(r)}>
            Delete
          </Button>
        </Space>
      ) },
  ];

  return (
    <Table
      dataSource={data}
      columns={columns}
      rowKey="id"
      loading={loading}
      pagination={{ current: page, pageSize: 20, total, onChange: setPage, showSizeChanger: false }}
      size="small"
    />
  );
}
