import { useState, useEffect, useCallback } from 'react';
import { Table, DatePicker, Select, Button, Typography, Flex, Tag, List, Grid } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import * as api from '../../api/audit-logs';
import type { AuditLog } from '../../api/audit-logs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { useBreakpoint } = Grid;

const ACTION_OPTIONS = [
  'asset_type.create', 'asset_type.update',
  'asset_batch.updated',
  'asset_item.deleted',
  'membership.invite', 'membership.accept', 'membership.role_change', 'membership.remove',
  'team.member_add', 'team.member_remove',
].map(a => ({ value: a, label: a }));

// ── Human-readable meta renderer ─────────────────────────────────────────────

type ChangeEntry = { from?: unknown; to?: unknown };

const FIELD_LABEL: Record<string, string> = {
  purchase_price:    'Price',
  purchase_date:     'Purchase Date',
  useful_life_years: 'Useful Life (yrs)',
  notes:             'Notes',
  brand:             'Brand',
  model:             'Model',
  size:              'Size',
  low_stock_threshold: 'Low Stock Threshold',
};

function renderChanges(changes: Record<string, ChangeEntry>) {
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

function assetLabel(meta: Record<string, unknown>): string | null {
  const parts = [meta.asset_name, meta.brand, meta.model, meta.size].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function renderMeta(action: string, meta: Record<string, unknown> | null | undefined) {
  if (!meta) return null;

  if (action === 'asset_batch.updated') {
    const changes = meta.changes as Record<string, ChangeEntry> | undefined;
    const label = assetLabel(meta);
    return (
      <Flex vertical gap={4}>
        {label && <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>}
        {changes && Object.keys(changes).length > 0 && renderChanges(changes)}
      </Flex>
    );
  }

  if (action === 'asset_type.create') {
    const label = assetLabel(meta);
    const qty = meta.quantity != null ? ` · qty ${meta.quantity}` : '';
    return <Text style={{ fontSize: 12 }}>{label ?? '—'}{qty}</Text>;
  }

  if (action === 'asset_type.update') {
    const changes = meta.changes as Record<string, ChangeEntry> | undefined;
    const label = assetLabel(meta);
    return (
      <Flex vertical gap={4}>
        {label && <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>}
        {changes && Object.keys(changes).length > 0 && renderChanges(changes)}
      </Flex>
    );
  }

  if (action === 'asset_item.deleted') {
    const sn = meta.serial_number ? `SN: ${meta.serial_number}` : null;
    const asset = meta.asset as string | undefined;
    const wh = meta.warehouse_name ? `@ ${meta.warehouse_name}` : null;
    return (
      <Flex vertical gap={2}>
        {asset && <Text style={{ fontSize: 12 }}>{asset}</Text>}
        <Text type="secondary" style={{ fontSize: 12 }}>{[sn, wh].filter(Boolean).join(' ')}</Text>
      </Flex>
    );
  }

  if (action === 'membership.invite') {
    const name = meta.user_name as string | undefined;
    const email = meta.email as string | undefined;
    const role = meta.role as string | undefined;
    return (
      <Text style={{ fontSize: 12 }}>
        {name ?? email ?? '—'}{email && name ? ` (${email})` : ''}{role ? ` invited as ${role}` : ''}
      </Text>
    );
  }

  if (action === 'membership.accept') {
    const name = meta.user_name as string | undefined;
    const role = meta.role as string | undefined;
    return <Text style={{ fontSize: 12 }}>{name ?? '—'} joined as {role ?? '—'}</Text>;
  }

  if (action === 'membership.role_change') {
    const name = meta.user_name as string | undefined;
    const from = meta.from_role as string | undefined;
    const to   = meta.to_role   as string | undefined;
    return (
      <Text style={{ fontSize: 12 }}>
        {name ?? '—'}: <Text delete style={{ fontSize: 12, color: '#ff4d4f' }}>{from ?? '—'}</Text>
        {' → '}
        <Text style={{ fontSize: 12, color: '#52c41a' }}>{to ?? '—'}</Text>
      </Text>
    );
  }

  if (action === 'membership.remove') {
    const name = meta.user_name as string | undefined;
    return <Text style={{ fontSize: 12 }}>{name ?? '—'} removed from club</Text>;
  }

  if (action === 'team.member_add') {
    const name = meta.user_name as string | undefined;
    const team = meta.team_name as string | undefined;
    const role = meta.role      as string | undefined;
    return (
      <Text style={{ fontSize: 12 }}>
        {name ?? '—'} added to <Text strong style={{ fontSize: 12 }}>{team ?? '—'}</Text>
        {role ? ` as ${role}` : ''}
      </Text>
    );
  }

  if (action === 'team.member_remove') {
    const name = meta.user_name as string | undefined;
    const team = meta.team_name as string | undefined;
    return (
      <Text style={{ fontSize: 12 }}>
        {name ?? '—'} removed from <Text strong style={{ fontSize: 12 }}>{team ?? '—'}</Text>
      </Text>
    );
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function AuditLogsPage() {
  const [data, setData] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  const screens = useBreakpoint();

  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const r = await api.getClubAuditLogs({ page: p, limit: 20, action, from: dateRange?.[0], to: dateRange?.[1] });
      setData(r.data.data);
      setTotal(r.data.total);
    } finally { setLoading(false); }
  }, [page, action, dateRange]);

  useEffect(() => { void load(); }, [load]);

  const onPageChange = (p: number) => { setPage(p); void load(p); };

  const columns: ColumnsType<AuditLog> = [
    { title: 'Time', dataIndex: 'created_at', key: 'created_at', width: 180, render: (d: string) => new Date(d).toLocaleString() },
    { title: 'Action', dataIndex: 'action', key: 'action', width: 220, render: (a: string) => <Tag style={{ whiteSpace: 'nowrap' }}>{a}</Tag> },
    { title: 'Entity', key: 'entity', width: 220, render: (_: unknown, r: AuditLog) => r.entity_type ? `${r.entity_type} / ${r.entity_id?.slice(0, 8) ?? ''}` : '—' },
    { title: 'Performed By', dataIndex: 'performed_by', key: 'performed_by', width: 140, render: (v: string | null) => v ?? '—' },
    {
      title: 'Details',
      key: 'details',
      render: (_: unknown, r: AuditLog) => renderMeta(r.action, r.meta) ?? <Text type="secondary">—</Text>,
    },
    { title: 'IP', dataIndex: 'ip_address', key: 'ip_address', width: 120, render: (v: string | null) => v ?? '—' },
  ];

  const filters = (
    <Flex gap={12} style={{ marginBottom: 16 }} wrap="wrap">
      <RangePicker
        style={{ width: screens.md ? undefined : '100%' }}
        onChange={v => setDateRange(v ? [v[0]!.toISOString(), v[1]!.toISOString()] : null)}
      />
      <Select
        allowClear placeholder="Filter by action"
        style={{ width: screens.md ? 200 : '100%' }}
        options={ACTION_OPTIONS}
        onChange={(v: string | undefined) => setAction(v)}
      />
      <Button onClick={() => { setPage(1); void load(1); }}>Search</Button>
    </Flex>
  );

  // ── Mobile: card list ──────────────────────────────────────────────────────
  if (!screens.md) {
    return (
      <div>
        <Title level={4} style={{ marginBottom: 16 }}>Audit Logs</Title>
        {filters}
        <List
          loading={loading}
          dataSource={data}
          rowKey="id"
          pagination={{
            current: page, total, pageSize: 20, size: 'small',
            onChange: onPageChange,
            style: { textAlign: 'center', marginTop: 12 },
          }}
          renderItem={(r: AuditLog) => (
            <List.Item style={{ padding: '10px 0', alignItems: 'flex-start' }}>
              <Flex vertical gap={6} style={{ width: '100%' }}>
                <Flex justify="space-between" align="center" gap={8}>
                  <Tag style={{ whiteSpace: 'nowrap', margin: 0 }}>{r.action}</Tag>
                  <Text type="secondary" style={{ fontSize: 11, flexShrink: 0 }}>
                    {new Date(r.created_at).toLocaleString()}
                  </Text>
                </Flex>
                {r.performed_by && (
                  <Text type="secondary" style={{ fontSize: 12 }}>By {r.performed_by}</Text>
                )}
                {renderMeta(r.action, r.meta)}
              </Flex>
            </List.Item>
          )}
        />
      </div>
    );
  }

  // ── Desktop: table ─────────────────────────────────────────────────────────
  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Audit Logs</Title>
      {filters}
      <Table
        rowKey="id" dataSource={data} columns={columns} loading={loading}
        scroll={{ x: 900 }}
        pagination={{ current: page, total, pageSize: 20, onChange: onPageChange }}
      />
    </div>
  );
}
