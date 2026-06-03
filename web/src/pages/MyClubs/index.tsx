import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Tag, Typography, Card, Empty, Space, App } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useAuth } from '../../contexts/AuthContext';
import * as membershipsApi from '../../api/memberships';
import type { PendingInvitation, ClubMembership } from '../../types';

const { Title } = Typography;

export default function MyClubsPage() {
  const { user, selectClub, refreshInvitationCount, updateUserClubs } = useAuth();
  const { message } = App.useApp();
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [loadingInv, setLoadingInv] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadInvitations = useCallback(async () => {
    setLoadingInv(true);
    try {
      const res = await membershipsApi.getMyInvitations();
      setInvitations(res.data.data);
    } catch { /* silent */ }
    finally { setLoadingInv(false); }
  }, []);

  useEffect(() => { void loadInvitations(); }, [loadInvitations]);

  async function handleAccept(inv: PendingInvitation) {
    setActionId(inv.invitation_id);
    try {
      await membershipsApi.acceptInvitation(inv.club_id, inv.invitation_id);
      const newMembership: ClubMembership = { club_id: inv.club_id, club_name: inv.club_name, role: inv.role };
      updateUserClubs([...(user?.clubs ?? []), newMembership]);
      await refreshInvitationCount();
      await loadInvitations();
      message.success(`Joined ${inv.club_name}`);
    } catch {
      message.error('Failed to accept invitation.');
    } finally { setActionId(null); }
  }

  async function handleDecline(inv: PendingInvitation) {
    setActionId(inv.invitation_id);
    try {
      await membershipsApi.declineInvitation(inv.club_id, inv.invitation_id);
      await refreshInvitationCount();
      await loadInvitations();
      message.success('Invitation declined.');
    } catch {
      message.error('Failed to decline invitation.');
    } finally { setActionId(null); }
  }

  const invColumns: ColumnsType<PendingInvitation> = [
    { title: 'Club', dataIndex: 'club_name', key: 'club_name' },
    { title: 'Invited by', dataIndex: 'invited_by_name', key: 'invited_by_name' },
    { title: 'Role', dataIndex: 'role', key: 'role', render: (r: string) => <Tag>{r.replace(/_/g, ' ')}</Tag> },
    { title: 'Date', dataIndex: 'created_at', key: 'created_at', render: (d: string) => new Date(d).toLocaleDateString() },
    {
      title: 'Action', key: 'action',
      render: (_: unknown, inv: PendingInvitation) => (
        <Space>
          <Button size="small" type="primary" loading={actionId === inv.invitation_id} onClick={() => void handleAccept(inv)}>Accept</Button>
          <Button size="small" danger loading={actionId === inv.invitation_id} onClick={() => void handleDecline(inv)}>Decline</Button>
        </Space>
      ),
    },
  ];

  const clubColumns: ColumnsType<ClubMembership> = [
    { title: 'Club', dataIndex: 'club_name', key: 'club_name' },
    { title: 'Role', dataIndex: 'role', key: 'role', render: (r: string) => <Tag>{r.replace(/_/g, ' ')}</Tag> },
    { title: 'Action', key: 'action', render: (_: unknown, m: ClubMembership) => <Button size="small" onClick={() => void selectClub(m.club_id)}>Switch to this club</Button> },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>My Clubs</Title>

      {invitations.length > 0 && (
        <Card title="Pending Invitations" style={{ marginBottom: 24 }}>
          <Table rowKey="invitation_id" dataSource={invitations} columns={invColumns} loading={loadingInv} pagination={false} />
        </Card>
      )}

      <Card title="My Clubs">
        {(user?.clubs ?? []).length === 0
          ? <Empty description="You have not joined any club yet." />
          : <Table rowKey="club_id" dataSource={user?.clubs ?? []} columns={clubColumns} pagination={false} />
        }
      </Card>
    </div>
  );
}
