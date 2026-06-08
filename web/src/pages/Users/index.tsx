import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Table, Button, Tag, Modal, Form, Select,
  Typography, Flex, App, Popconfirm, Space, Divider, Empty, Input, Spin,
} from 'antd';
import {
  UserAddOutlined, EditOutlined, StopOutlined, InfoCircleOutlined, CloseOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import {
  listUsers, getUser, updateMemberRole, removeMember, searchUsers, type ClubUser,
} from '../../api/users';
import {
  listClubInvitations, sendInvitation, cancelClubInvitation, type ClubInvitation,
} from '../../api/memberships';
import type { ClubRole } from '../../types';
import type { UserTeamMembership, TeamRole } from '../../api/teams';

const { Title, Text } = Typography;

const ROLE_OPTIONS = [
  { value: 'club_admin',    label: 'Admin' },
  { value: 'asset_manager', label: 'Asset Manager' },
  { value: 'coach',         label: 'Coach' },
  { value: 'accountant',    label: 'Accountant' },
];

const ROLE_COLOR: Record<string, string> = {
  club_admin:    'blue',
  asset_manager: 'cyan',
  coach:         'green',
  accountant:    'purple',
};

const TEAM_ROLE_LABEL: Record<TeamRole, string> = {
  head_coach:       'Head Coach',
  assistant_coach:  'Assistant Coach',
  team_manager:     'Team Manager',
};

const TEAM_ROLE_COLOR: Record<TeamRole, string> = {
  head_coach:      'gold',
  assistant_coach: 'blue',
  team_manager:    'cyan',
};

type MemberRow = ClubUser & { _type: 'member' };
type InvitationRow = ClubInvitation & { _type: 'invitation' };
type TableRow = MemberRow | InvitationRow;

const PAGE_SIZE = 20;

export default function UsersPage() {
  const { user: me, activeClub } = useAuth();
  const { message } = App.useApp();
  const isAdmin = activeClub?.role === 'club_admin';

  const [rows, setRows] = useState<TableRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Change role modal
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<MemberRow | null>(null);
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleForm] = Form.useForm();

  // Invite modal
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteForm] = Form.useForm();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; first_name: string; last_name: string; email: string }>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{ id: string; first_name: string; last_name: string; email: string } | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Coach detail modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailUser, setDetailUser] = useState<ClubUser | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchAll = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const [membersRes, invitesRes] = await Promise.all([
        listUsers({ page: p, limit: PAGE_SIZE, is_active: true }),
        isAdmin && activeClub ? listClubInvitations(activeClub.club_id) : Promise.resolve(null),
      ]);

      const members: MemberRow[] = membersRes.data.data.map(u => ({ ...u, _type: 'member' as const }));
      const invitations: InvitationRow[] = (invitesRes?.data ?? []).map(i => ({ ...i, _type: 'invitation' as const }));

      setRows([...members, ...invitations]);
      setTotal(membersRes.data.total + invitations.length);
    } catch {
      message.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [page, isAdmin, activeClub, message]);

  useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Invite modal ──────────────────────────────────────────────────────────

  function openInvite() {
    inviteForm.resetFields();
    setSearchQuery('');
    setSearchResults([]);
    setSelectedUser(null);
    setInviteOpen(true);
  }

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    setSelectedUser(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!value.trim() || !activeClub) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await searchUsers(activeClub.club_id, value.trim());
        setSearchResults(res.data);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 400);
  }

  async function handleSendInvitation(values: { role: ClubRole }) {
    if (!selectedUser || !activeClub) return;
    setInviteSaving(true);
    try {
      await sendInvitation(activeClub.club_id, selectedUser.id, values.role);
      message.success(`Invitation sent to ${selectedUser.first_name} ${selectedUser.last_name}`);
      setInviteOpen(false);
      fetchAll();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Failed to send invitation';
      message.error(msg);
    } finally {
      setInviteSaving(false);
    }
  }

  // ── Change role ───────────────────────────────────────────────────────────

  function openChangeRole(row: MemberRow) {
    roleForm.setFieldsValue({ role: row.role });
    setRoleTarget(row);
    setRoleModalOpen(true);
  }

  async function handleChangeRole(values: { role: ClubRole }) {
    if (!roleTarget || !activeClub) return;
    setRoleSaving(true);
    try {
      await updateMemberRole(activeClub.club_id, roleTarget.id, values.role);
      message.success('Role updated');
      setRoleModalOpen(false);
      fetchAll();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Failed to update role';
      message.error(msg);
    } finally {
      setRoleSaving(false);
    }
  }

  // ── Remove member ─────────────────────────────────────────────────────────

  async function handleRemove(row: MemberRow) {
    if (!activeClub) return;
    try {
      await removeMember(activeClub.club_id, row.id);
      message.success(`${row.name} has been removed`);
      fetchAll();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Failed to remove member';
      message.error(msg);
    }
  }

  // ── Cancel invitation ─────────────────────────────────────────────────────

  async function handleCancelInvitation(row: InvitationRow) {
    if (!activeClub) return;
    try {
      await cancelClubInvitation(activeClub.club_id, row.id);
      message.success('Invitation cancelled');
      fetchAll();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Failed to cancel invitation';
      message.error(msg);
    }
  }

  // ── Coach detail ──────────────────────────────────────────────────────────

  async function openDetail(row: MemberRow) {
    setDetailOpen(true);
    setDetailUser(row);
    setDetailLoading(true);
    try {
      const res = await getUser(row.id);
      setDetailUser(res.data);
    } catch {
      message.error('Failed to load user details');
    } finally {
      setDetailLoading(false);
    }
  }

  // ── Table columns ─────────────────────────────────────────────────────────

  const columns = [
    {
      title: 'Name',
      key: 'name',
      render: (_: unknown, row: TableRow) => {
        if (row._type === 'member') return <Text>{row.name}</Text>;
        return <Text>{row.first_name} {row.last_name}</Text>;
      },
    },
    {
      title: 'Email',
      key: 'email',
      ellipsis: true,
      render: (_: unknown, row: TableRow) => row.email,
    },
    {
      title: 'Role',
      key: 'role',
      render: (_: unknown, row: TableRow) => (
        <Tag color={ROLE_COLOR[row.role] ?? 'default'}>
          {ROLE_OPTIONS.find(r => r.value === row.role)?.label ?? row.role}
        </Tag>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      render: (_: unknown, row: TableRow) =>
        row._type === 'invitation'
          ? <Tag color="warning">Pending</Tag>
          : <Tag color={row.is_active ? 'success' : 'default'}>{row.is_active ? 'Active' : 'Inactive'}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_: unknown, row: TableRow) => {
        if (row._type === 'invitation') {
          return isAdmin ? (
            <Popconfirm
              title="Cancel this invitation?"
              onConfirm={() => handleCancelInvitation(row)}
              okText="Cancel Invitation"
              okButtonProps={{ danger: true }}
            >
              <Button type="text" size="small" icon={<CloseOutlined />} danger />
            </Popconfirm>
          ) : null;
        }

        return (
          <Space size={4}>
            {row.role === 'coach' && (
              <Button type="text" size="small" icon={<InfoCircleOutlined />}
                onClick={() => openDetail(row)} />
            )}
            {isAdmin && (
              <Button type="text" size="small" icon={<EditOutlined />}
                onClick={() => openChangeRole(row)} />
            )}
            {isAdmin && row.is_active && row.id !== me?.id && (
              <Popconfirm
                title={`Remove ${row.name}?`}
                description="They will be removed from this club."
                onConfirm={() => handleRemove(row)}
                okText="Remove"
                okButtonProps={{ danger: true }}
              >
                <Button type="text" size="small" icon={<StopOutlined />} danger />
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <Flex justify="space-between" align="center" style={{ marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>Users</Title>
        {isAdmin && (
          <Button type="primary" icon={<UserAddOutlined />} onClick={openInvite}>
            Invite User
          </Button>
        )}
      </Flex>

      <Table
        dataSource={rows}
        columns={columns}
        rowKey={r => `${r._type}-${r.id}`}
        loading={loading}
        scroll={{ x: 600 }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showTotal: t => `${t} users`,
          onChange: p => { setPage(p); fetchAll(p); },
        }}
      />

      {/* ── Invite User modal ──────────────────────────────────────────── */}
      <Modal
        open={inviteOpen}
        title="Invite User"
        onCancel={() => setInviteOpen(false)}
        footer={null}
        destroyOnClose
        width={480}
      >
        <Form form={inviteForm} layout="vertical" onFinish={handleSendInvitation} style={{ marginTop: 16 }}>
          <Form.Item label="Search User">
            <Input
              placeholder="Search by name or email…"
              value={searchQuery}
              onChange={e => handleSearchChange(e.target.value)}
              allowClear
              suffix={searchLoading ? <Spin size="small" /> : null}
            />
          </Form.Item>

          {/* Search results */}
          {!selectedUser && searchResults.length > 0 && (
            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, marginBottom: 16, maxHeight: 200, overflowY: 'auto' }}>
              {searchResults.map(u => (
                <div
                  key={u.id}
                  onClick={() => { setSelectedUser(u); setSearchQuery(`${u.first_name} ${u.last_name}`); setSearchResults([]); }}
                  style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <Text strong>{u.first_name} {u.last_name}</Text>
                  <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{u.email}</Text>
                </div>
              ))}
            </div>
          )}

          {!selectedUser && searchQuery.trim() && !searchLoading && searchResults.length === 0 && (
            <div style={{ marginBottom: 16 }}>
              <Empty description="No users found" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
          )}

          {/* Selected user */}
          {selectedUser && (
            <div style={{ background: '#f0f5ff', border: '1px solid #adc6ff', borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Text strong>{selectedUser.first_name} {selectedUser.last_name}</Text>
                <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{selectedUser.email}</Text>
              </div>
              <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => { setSelectedUser(null); setSearchQuery(''); }} />
            </div>
          )}

          <Form.Item name="role" label="Club Role" rules={[{ required: true, message: 'Please select a role' }]}>
            <Select placeholder="Select role" options={ROLE_OPTIONS} />
          </Form.Item>

          <Flex gap={8} justify="flex-end">
            <Button onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={inviteSaving} disabled={!selectedUser}>
              Send Invitation
            </Button>
          </Flex>
        </Form>
      </Modal>

      {/* ── Change Role modal ──────────────────────────────────────────── */}
      <Modal
        open={roleModalOpen}
        title={`Change Role — ${roleTarget?.name}`}
        onCancel={() => setRoleModalOpen(false)}
        footer={null}
        destroyOnClose
        width={360}
      >
        <Form form={roleForm} layout="vertical" onFinish={handleChangeRole} style={{ marginTop: 16 }}>
          <Form.Item name="role" label="Role" rules={[{ required: true }]}>
            <Select options={ROLE_OPTIONS} />
          </Form.Item>
          <Flex gap={8} justify="flex-end">
            <Button onClick={() => setRoleModalOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={roleSaving} icon={<EditOutlined />}>
              Save
            </Button>
          </Flex>
        </Form>
      </Modal>

      {/* ── Coach detail modal ─────────────────────────────────────────── */}
      <Modal
        open={detailOpen}
        title={detailUser?.name}
        onCancel={() => setDetailOpen(false)}
        footer={<Button onClick={() => setDetailOpen(false)}>Close</Button>}
        destroyOnClose
      >
        {detailLoading ? null : (
          <div style={{ marginTop: 8 }}>
            <Flex gap={8} wrap="wrap" style={{ marginBottom: 12 }}>
              <span><strong>Email:</strong> {detailUser?.email}</span>
              {detailUser?.phone && <span><strong>Phone:</strong> {detailUser.phone}</span>}
            </Flex>
            <Divider titlePlacement="left" style={{ fontSize: 13 }}>Team Assignments</Divider>
            {!detailUser?.teams?.length ? (
              <Empty description="Not assigned to any team" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {(detailUser.teams as UserTeamMembership[]).map(t => (
                  <Flex key={t.team_id} justify="space-between" align="center"
                    style={{ padding: '8px 12px', background: '#fafafa', borderRadius: 6 }}>
                    <Flex align="center" gap={8}>
                      <Tag color={t.gender === 'Boys' ? 'geekblue' : t.gender === 'Girls' ? 'magenta' : 'purple'}>
                        {t.gender}
                      </Tag>
                      <Tag>{t.age_group}</Tag>
                      <Typography.Text strong>{t.team_name}</Typography.Text>
                    </Flex>
                    <Tag color={TEAM_ROLE_COLOR[t.team_role as TeamRole]}>
                      {TEAM_ROLE_LABEL[t.team_role as TeamRole]}
                    </Tag>
                  </Flex>
                ))}
              </Space>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
