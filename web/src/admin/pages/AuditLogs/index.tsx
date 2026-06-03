import { useState, useEffect, useCallback } from 'react';
import { Table, DatePicker, Button, Typography, Flex, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import * as api from '../../api/admin';
import type { AdminAuditLog } from '../../api/admin';

const { Title } = Typography;
const { RangePicker } = DatePicker;

export default function AdminAuditLogsPage() {
  const [data, setData] = useState<AdminAuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);

  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const r = await api.getAdminAuditLogs({ page: p, limit: 20, from: dateRange?.[0], to: dateRange?.[1] });
      setData(r.data.data);
      setTotal(r.data.total);
    } finally { setLoading(false); }
  }, [page, dateRange]);

  useEffect(() => { void load(); }, [load]);

  const columns: ColumnsType<AdminAuditLog> = [
    { title: 'Time', dataIndex: 'created_at', width: 160, render: (d: string) => new Date(d).toLocaleString() },
    { title: 'Club', dataIndex: 'club_name', render: (v: string | null) => v ?? '—' },
    { title: 'Action', dataIndex: 'action', render: (a: string) => <Tag>{a}</Tag> },
    { title: 'Entity', render: (_: unknown, r: AdminAuditLog) => r.entity_type ? `${r.entity_type}/${r.entity_id?.slice(0, 8)}` : '—' },
    { title: 'By', dataIndex: 'performed_by', render: (v: string | null) => v ?? '—' },
    { title: 'IP', dataIndex: 'ip_address', render: (v: string | null) => v ?? '—' },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Audit Logs</Title>
      <Flex gap={12} style={{ marginBottom: 16 }} wrap="wrap">
        <RangePicker onChange={v => setDateRange(v ? [v[0]!.toISOString(), v[1]!.toISOString()] : null)} />
        <Button onClick={() => { setPage(1); void load(1); }}>Search</Button>
      </Flex>
      <Table rowKey="id" dataSource={data} columns={columns} loading={loading}
        pagination={{ current: page, total, pageSize: 20, onChange: (p: number) => { setPage(p); void load(p); } }} />
    </div>
  );
}
