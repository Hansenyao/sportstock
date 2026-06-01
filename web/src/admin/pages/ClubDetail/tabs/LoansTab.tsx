// frontend/src/admin/pages/ClubDetail/tabs/LoansTab.tsx
import { useEffect, useState, useCallback } from 'react';
import { Table, Tag, Select, Space, App } from 'antd';
import { listClubLoans } from '../../../api/admin';

interface Loan {
  id: string; status: string; due_date: string;
  coach_name: string; item_count: number; created_at: string;
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'default', approved: 'blue', rejected: 'error',
  checked_out: 'processing', returned: 'success',
};

export default function LoansTab({ clubId }: { clubId: string }) {
  const { message } = App.useApp();
  const [data,      setData]      = useState<Loan[]>([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [status,    setStatus]    = useState<string | undefined>(undefined);
  const [loading,   setLoading]   = useState(false);

  const fetch = useCallback(async (p: number, s?: string) => {
    setLoading(true);
    try {
      const res = await listClubLoans(clubId, { page: p, limit: 20, status: s });
      setData(res.data as unknown as Loan[]);
      setTotal(res.total);
    } catch { message.error('Failed to load loans'); }
    finally { setLoading(false); }
  }, [clubId, message]);

  useEffect(() => { fetch(page, status); }, [page, status, fetch]);

  const columns = [
    { title: 'Coach',    dataIndex: 'coach_name', key: 'coach_name' },
    { title: 'Items',    dataIndex: 'item_count', key: 'item_count' },
    { title: 'Due',      dataIndex: 'due_date',   key: 'due_date',
      render: (v: string) => new Date(v).toLocaleDateString() },
    { title: 'Status', dataIndex: 'status', key: 'status',
      render: (v: string) => <Tag color={STATUS_COLOR[v] ?? 'default'}>{v}</Tag> },
    { title: 'Created', dataIndex: 'created_at', key: 'created_at',
      render: (v: string) => new Date(v).toLocaleDateString() },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Select
          placeholder="Filter by status"
          allowClear
          style={{ width: 180 }}
          onChange={(v: string | undefined) => { setStatus(v); setPage(1); }}
          options={[
            { value: 'pending',     label: 'Pending' },
            { value: 'approved',    label: 'Approved' },
            { value: 'checked_out', label: 'Checked Out' },
            { value: 'returned',    label: 'Returned' },
            { value: 'rejected',    label: 'Rejected' },
          ]}
        />
      </Space>
      <Table
        dataSource={data}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ current: page, pageSize: 20, total, onChange: setPage, showSizeChanger: false }}
        size="small"
      />
    </div>
  );
}
