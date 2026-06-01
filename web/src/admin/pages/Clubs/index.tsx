// frontend/src/admin/pages/Clubs/index.tsx
import { useEffect, useState, useCallback } from 'react';
import { Table, Tag, Input, Button, Typography, App, Space } from 'antd';
import { SearchOutlined, EyeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { listClubs } from '../../api/admin';
import type { ClubListItem } from '../../api/admin';

const { Title } = Typography;

export default function AdminClubsPage() {
  const { message } = App.useApp();
  const navigate    = useNavigate();
  const [data,     setData]     = useState<ClubListItem[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(false);
  const [search,   setSearch]   = useState('');

  const fetchClubs = useCallback(async (p: number, s: string) => {
    setLoading(true);
    try {
      const res = await listClubs({ page: p, limit: 20, search: s || undefined });
      setData(res.data);
      setTotal(res.total);
    } catch {
      message.error('Failed to load clubs');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { fetchClubs(page, search); }, [page, search, fetchClubs]);

  const columns = [
    { title: 'Club Name',    dataIndex: 'name',             key: 'name',
      render: (v: string, r: ClubListItem) => (
        <a onClick={() => navigate(`/admin/clubs/${r.id}`)} style={{ color: '#1668dc' }}>{v}</a>
      )},
    { title: 'Sport',        dataIndex: 'sport_type',       key: 'sport_type', render: (v: string | null) => v ?? '—' },
    { title: 'Users',        dataIndex: 'user_count',       key: 'user_count' },
    { title: 'Assets',       dataIndex: 'asset_count',      key: 'asset_count' },
    { title: 'Active Loans', dataIndex: 'active_loan_count',key: 'active_loan_count' },
    { title: 'Status', dataIndex: 'is_active', key: 'is_active',
      render: (v: boolean) => <Tag color={v ? 'success' : 'error'}>{v ? 'Active' : 'Disabled'}</Tag> },
    { title: '', key: 'actions',
      render: (_: unknown, r: ClubListItem) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/admin/clubs/${r.id}`)}>
          View
        </Button>
      ) },
  ];

  return (
    <div>
      <Title level={4} style={{ color: '#fff', marginBottom: 16 }}>Clubs</Title>
      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="Search by name..."
          prefix={<SearchOutlined />}
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{ width: 260 }}
          allowClear
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
