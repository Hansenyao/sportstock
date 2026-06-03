import { useState, useEffect, useCallback } from 'react';
import { Table, DatePicker, Select, Button, Typography, Flex, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import * as api from '../../api/audit-logs';
import type { AuditLog } from '../../api/audit-logs';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const ACTION_OPTIONS = [
  'auth.login','auth.register','club.create','membership.invite','membership.accept',
  'asset_type.create','asset_type.update','asset_item.retire','asset_item.write_off',
  'loan.create','loan.approve','loan.reject','loan.checkout','loan.return',
  'kit.create','kit.delete',
].map(a => ({ value: a, label: a }));

export default function AuditLogsPage() {
  const [data, setData] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);

  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const r = await api.getClubAuditLogs({ page: p, limit: 20, action, from: dateRange?.[0], to: dateRange?.[1] });
      setData(r.data.data);
      setTotal(r.data.total);
    } finally { setLoading(false); }
  }, [page, action, dateRange]);

  useEffect(() => { void load(); }, [load]);

  const columns: ColumnsType<AuditLog> = [
    { title: 'Time', dataIndex: 'created_at', key: 'created_at', width: 160, render: (d: string) => new Date(d).toLocaleString() },
    { title: 'Action', dataIndex: 'action', key: 'action', render: (a: string) => <Tag>{a}</Tag> },
    { title: 'Entity', key: 'entity', render: (_: unknown, r: AuditLog) => r.entity_type ? `${r.entity_type} / ${r.entity_id?.slice(0, 8) ?? ''}` : '—' },
    { title: 'Performed By', dataIndex: 'performed_by', key: 'performed_by', render: (v: string | null) => v ?? '—' },
    { title: 'IP', dataIndex: 'ip_address', key: 'ip_address', render: (v: string | null) => v ?? '—' },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Audit Logs</Title>
      <Flex gap={12} style={{ marginBottom: 16 }} wrap="wrap">
        <RangePicker onChange={v => setDateRange(v ? [v[0]!.toISOString(), v[1]!.toISOString()] : null)} />
        <Select allowClear placeholder="Filter by action" style={{ width: 200 }} options={ACTION_OPTIONS} onChange={(v: string | undefined) => setAction(v)} />
        <Button onClick={() => { setPage(1); void load(1); }}>Search</Button>
      </Flex>
      <Table
        rowKey="id" dataSource={data} columns={columns} loading={loading}
        pagination={{ current: page, total, pageSize: 20, onChange: (p: number) => { setPage(p); void load(p); } }}
      />
    </div>
  );
}
