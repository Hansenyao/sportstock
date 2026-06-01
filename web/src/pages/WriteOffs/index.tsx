import { useEffect, useState, useCallback } from 'react';
import {
  Table, Button, Tag, Modal, Form, Select, Input, Typography, Flex, App,
  Avatar, Grid,
} from 'antd';
import { PlusOutlined, PictureOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  listWriteOffs, createWriteOff,
  type WriteOff, type WriteOffSource,
} from '../../api/write-offs';
import { listAssets, type AssetType } from '../../api/assets';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { useBreakpoint } = Grid;

const SOURCE_COLOR: Record<WriteOffSource, string> = {
  manual:      'orange',
  loan_return: 'blue',
  loan_lost:   'red',
};
const SOURCE_LABEL: Record<WriteOffSource, string> = {
  manual:      'Manual',
  loan_return: 'Loan Return',
  loan_lost:   'Lost',
};

const PAGE_SIZE = 20;

function AssetThumb({ src }: { src?: string | null }) {
  return src
    ? <Avatar shape="square" size={36} src={src} />
    : <Avatar shape="square" size={36} icon={<PictureOutlined />}
        style={{ background: '#f0f0f0', color: '#bfbfbf' }} />;
}

export default function WriteOffsPage() {
  const { message } = App.useApp();
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const [records, setRecords] = useState<WriteOff[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);

  const [assets, setAssets]   = useState<AssetType[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating]     = useState(false);
  const [form] = Form.useForm();

  const fetchRecords = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const res = await listWriteOffs({ page: p, limit: PAGE_SIZE });
      setRecords(res.data.data);
      setTotal(res.data.total);
    } catch { message.error('Failed to load write-off orders'); }
    finally { setLoading(false); }
  }, [page, message]);

  useEffect(() => { fetchRecords(); }, []); // eslint-disable-line
  useEffect(() => {
    listAssets({ limit: 200 }).then(r => setAssets(r.data.data)).catch(() => {});
  }, []);

  async function handleCreate(values: Record<string, unknown>) {
    setCreating(true);
    try {
      await createWriteOff({
        asset_type_id: values.asset_type_id as string,
        quantity: Number(values.quantity),
        reason:   values.reason as string | undefined,
        notes:    values.notes as string | undefined,
      });
      message.success('Write-off order created');
      setCreateOpen(false);
      fetchRecords();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to create write-off';
      message.error(msg);
    } finally { setCreating(false); }
  }

  const columns: ColumnsType<WriteOff> = [
    {
      title: 'Asset',
      key: 'asset',
      render: (_: unknown, r: WriteOff) => (
        <Flex align="center" gap={10}>
          <AssetThumb src={r.asset_image} />
          <div>
            <Text strong style={{ display: 'block', fontSize: 13 }}>{r.asset_name}</Text>
            <Text style={{ fontSize: 11, color: '#8c8c8c' }}>
              {[r.brand, r.model, r.size && `Size: ${r.size}`]
                .filter(Boolean).join(' · ')}
            </Text>
          </div>
        </Flex>
      ),
    },
    {
      title: 'Qty',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 60,
      render: (q: number) => <Text strong>×{q}</Text>,
    },
    {
      title: 'Source',
      dataIndex: 'source',
      key: 'source',
      width: 110,
      responsive: ['sm'] as ('sm')[],
      render: (s: WriteOffSource) => <Tag color={SOURCE_COLOR[s]}>{SOURCE_LABEL[s]}</Tag>,
    },
    {
      title: 'By',
      key: 'created_by',
      width: 110,
      responsive: ['sm'] as ('sm')[],
      render: (_: unknown, r: WriteOff) => <Text style={{ fontSize: 12 }}>{r.created_by_name}</Text>,
    },
    {
      title: 'Date',
      key: 'date',
      width: 90,
      render: (_: unknown, r: WriteOff) => (
        <Text style={{ fontSize: 12 }}>{dayjs(r.created_at).format('MMM D, YYYY')}</Text>
      ),
    },
    {
      title: 'Reason',
      dataIndex: 'reason',
      key: 'reason',
      responsive: ['lg'] as ('lg')[],
      render: (r: string | null) => <Text style={{ fontSize: 12, color: '#595959' }}>{r ?? '—'}</Text>,
    },
  ];

  return (
    <div>
      <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Write-offs</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setCreateOpen(true); }}>
          {!isMobile && 'New Write-off'}
        </Button>
      </Flex>

      <Table
        dataSource={records}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        scroll={{ x: isMobile ? 320 : 600 }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showTotal: t => `${t} records`,
          simple: isMobile,
          onChange: p => { setPage(p); fetchRecords(p); },
        }}
      />

      <Modal
        open={createOpen}
        title="New Write-off Order"
        onCancel={() => setCreateOpen(false)}
        footer={null}
        width={480}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <Form.Item name="asset_type_id" label="Asset"
            rules={[{ required: true, message: 'Please select an asset' }]}>
            <Select
              showSearch
              placeholder="Select asset"
              filterOption={(input, option) =>
                String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
              options={assets.map(a => ({
                value: a.id,
                label: `${a.name}${a.size ? ` (${a.size})` : ''} — ${a.available_quantity} avail.`,
                disabled: a.available_quantity === 0,
              }))}
            />
          </Form.Item>
          <Form.Item name="quantity" label="Quantity"
            rules={[{ required: true, message: 'Please enter quantity' }]}>
            <Select placeholder="How many to write off?"
              options={Array.from({ length: 100 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))}
            />
          </Form.Item>
          <Form.Item name="reason" label="Reason"
            rules={[{ required: true, message: 'Please enter a reason' }]}>
            <TextArea rows={2} placeholder="e.g. Damaged beyond repair, Lost, Expired…" />
          </Form.Item>
          <Form.Item name="notes" label="Additional notes (optional)">
            <TextArea rows={2} />
          </Form.Item>
          <Flex gap={8} justify="flex-end">
            <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={creating}>Create Write-off</Button>
          </Flex>
        </Form>
      </Modal>
    </div>
  );
}
