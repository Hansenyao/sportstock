import { useState, useEffect, useCallback } from 'react';
import { Table, DatePicker, Select, Button, Typography, Flex, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import * as api from '../../api/audit-logs';
import type { AuditLog } from '../../api/audit-logs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const ACTION_OPTIONS = [
  'auth.login','auth.register','club.create','membership.invite','membership.accept',
  'asset_type.create','asset_type.update','asset_item.retire','asset_item.write_off',
  'asset_item.deleted','asset_batch.updated',
  'loan.create','loan.approve','loan.reject','loan.checkout','loan.return',
  'kit.create','kit.delete',
].map(a => ({ value: a, label: a }));

// ── Human-readable meta renderer ─────────────────────────────────────────────

type ChangeEntry = { from?: unknown; to?: unknown };

function renderChanges(changes: Record<string, ChangeEntry>) {
  const FIELD_LABEL: Record<string, string> = {
    purchase_price:    'Price',
    purchase_date:     'Purchase Date',
    useful_life_years: 'Useful Life (yrs)',
    notes:             'Notes',
  };
  return (
    <Flex vertical gap={2}>
      {Object.entries(changes).map(([field, { from, to }]) => (
        <Text key={field} style={{ fontSize: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>{FIELD_LABEL[field] ?? field}: </Text>
          <Text delete style={{ fontSize: 12, color: '#ff4d4f' }}>{String(from ?? '—')}</Text>
          {' → '}
          <Text style={{ fontSize: 12, color: '#52c41a' }}>{String(to ?? '—')}</Text>
        </Text>
      ))}
    </Flex>
  );
}

function renderMeta(action: string, meta: Record<string, unknown> | null | undefined) {
  if (!meta) return null;

  if (action === 'asset_batch.updated') {
    const changes = meta.changes as Record<string, ChangeEntry> | undefined;
    if (changes && Object.keys(changes).length > 0) return renderChanges(changes);
  }

  if (action === 'asset_item.deleted') {
    return (
      <Text type="secondary" style={{ fontSize: 12 }}>
        {meta.serial_number ? `SN: ${meta.serial_number}` : 'No serial number'}
      </Text>
    );
  }

  // Fallback: show raw JSON in tooltip
  const json = JSON.stringify(meta, null, 2);
  if (json === '{}') return null;
  return (
    <Tooltip title={<pre style={{ fontSize: 11, margin: 0, maxWidth: 400, whiteSpace: 'pre-wrap' }}>{json}</pre>}>
      <Text type="secondary" style={{ fontSize: 12, cursor: 'pointer', textDecoration: 'underline dotted' }}>
        details
      </Text>
    </Tooltip>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

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
    { title: 'Action', dataIndex: 'action', key: 'action', width: 200, render: (a: string) => <Tag>{a}</Tag> },
    { title: 'Entity', key: 'entity', width: 180, render: (_: unknown, r: AuditLog) => r.entity_type ? `${r.entity_type} / ${r.entity_id?.slice(0, 8) ?? ''}` : '—' },
    { title: 'Performed By', dataIndex: 'performed_by', key: 'performed_by', width: 140, render: (v: string | null) => v ?? '—' },
    {
      title: 'Details',
      key: 'details',
      render: (_: unknown, r: AuditLog) => renderMeta(r.action, r.meta) ?? <Text type="secondary">—</Text>,
    },
    { title: 'IP', dataIndex: 'ip_address', key: 'ip_address', width: 120, render: (v: string | null) => v ?? '—' },
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
        scroll={{ x: 800 }}
        pagination={{ current: page, total, pageSize: 20, onChange: (p: number) => { setPage(p); void load(p); } }}
      />
    </div>
  );
}
