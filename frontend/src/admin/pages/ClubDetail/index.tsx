// frontend/src/admin/pages/ClubDetail/index.tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Tabs, Button, Typography, Spin, App } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { getClubDetail } from '../../api/admin';
import type { ClubDetail } from '../../api/admin';
import OverviewTab from './tabs/OverviewTab';
import UsersTab    from './tabs/UsersTab';
import AssetsTab   from './tabs/AssetsTab';
import LoansTab    from './tabs/LoansTab';

const { Title } = Typography;

export default function ClubDetailPage() {
  const { id }    = useParams<{ id: string }>();
  const navigate  = useNavigate();
  const { message } = App.useApp();
  const [club,    setClub]    = useState<ClubDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchClub = async () => {
    if (!id) return;
    try {
      setClub(await getClubDetail(id));
    } catch {
      message.error('Failed to load club details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchClub(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Spin style={{ display: 'block', margin: '80px auto' }} />;
  if (!club || !id) return null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Button icon={<ArrowLeftOutlined />} type="text" style={{ color: '#555' }} onClick={() => navigate('/admin/clubs')} />
        <Title level={4} style={{ color: '#fff', margin: 0 }}>{club.name}</Title>
      </div>
      <Tabs
        items={[
          { key: 'overview', label: 'Overview', children: <OverviewTab club={club} onRefresh={fetchClub} /> },
          { key: 'users',    label: 'Users',    children: <UsersTab clubId={id} /> },
          { key: 'assets',   label: 'Assets',   children: <AssetsTab clubId={id} /> },
          { key: 'loans',    label: 'Loans',    children: <LoansTab clubId={id} /> },
        ]}
      />
    </div>
  );
}
