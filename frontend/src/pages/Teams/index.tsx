import { useEffect, useState } from 'react';
import {
  Table, Button, Tag, Modal, Form, Input, Select,
  Typography, Flex, App, Popconfirm, Space, Drawer,
  List, Avatar, Divider,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  TeamOutlined, UserOutlined, CloseOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  listTeams, getTeam, createTeam, updateTeam, deleteTeam,
  addMember, updateMember, removeMember,
  type Team, type TeamMember, type TeamRole, type Gender,
} from '../../api/teams';
import { listUsers, type ClubUser } from '../../api/users';

const { Title, Text } = Typography;

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'Boys',  label: 'Boys' },
  { value: 'Girls', label: 'Girls' },
  { value: 'Mixed', label: 'Mixed' },
];

const AGE_GROUP_OPTIONS = [
  'U4','U5','U6','U7','U8','U9','U10','U11',
  'U12','U13','U14','U15','U16','U17','U18','U19','U20','U21','Adult',
].map(v => ({ value: v, label: v }));

const ROLE_OPTIONS: { value: TeamRole; label: string }[] = [
  { value: 'head_coach',      label: 'Head Coach' },
  { value: 'assistant_coach', label: 'Assistant Coach' },
  { value: 'team_manager',    label: 'Team Manager' },
];

const ROLE_COLOR: Record<TeamRole, string> = {
  head_coach:      'gold',
  assistant_coach: 'blue',
  team_manager:    'cyan',
};

const GENDER_COLOR: Record<Gender, string> = {
  Boys: 'geekblue', Girls: 'magenta', Mixed: 'purple',
};

function apiError(err: unknown): string {
  return (err as { response?: { data?: { message?: string } } })
    ?.response?.data?.message ?? 'Operation failed';
}

type TeamModalMode = 'create' | 'edit';

export default function TeamsPage() {
  const { message } = App.useApp();
  const [teamForm] = Form.useForm();
  const [addMemberForm] = Form.useForm();

  // Teams list
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  // Team create/edit modal
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [teamModalMode, setTeamModalMode] = useState<TeamModalMode>('create');
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [saving, setSaving] = useState(false);

  // Members drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);

  // Add-member sub-form inside drawer
  const [addingMember, setAddingMember] = useState(false);
  const [coaches, setCoaches] = useState<ClubUser[]>([]);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [removingMember, setRemovingMember] = useState<string | null>(null);

  // ── Data loading ─────────────────────────────────────────────────────────────

  async function fetchTeams() {
    setLoading(true);
    try {
      const res = await listTeams();
      setTeams(res.data);
    } catch {
      message.error('Failed to load teams');
    } finally {
      setLoading(false);
    }
  }

  async function refreshDrawer(teamId: string) {
    setMembersLoading(true);
    try {
      const res = await getTeam(teamId);
      setSelectedTeam(res.data);
      setTeams(prev => prev.map(t => t.id === teamId
        ? { ...t, member_count: res.data.members?.length ?? t.member_count }
        : t
      ));
    } catch {
      message.error('Failed to load team members');
    } finally {
      setMembersLoading(false);
    }
  }

  useEffect(() => {
    fetchTeams();
    listUsers({ role: 'coach', limit: 200, is_active: 'true' })
      .then(r => setCoaches(r.data.data))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Team modal ────────────────────────────────────────────────────────────────

  function openCreate() {
    teamForm.resetFields();
    setTeamModalMode('create');
    setEditingTeam(null);
    setTeamModalOpen(true);
  }

  function openEdit(team: Team) {
    teamForm.setFieldsValue({ name: team.name, gender: team.gender, age_group: team.age_group });
    setTeamModalMode('edit');
    setEditingTeam(team);
    setTeamModalOpen(true);
  }

  async function handleTeamSubmit(values: { name: string; gender: Gender; age_group: string }) {
    setSaving(true);
    try {
      if (teamModalMode === 'create') {
        await createTeam(values);
        message.success('Team created');
      } else if (editingTeam) {
        await updateTeam(editingTeam.id, values);
        message.success('Team updated');
        if (selectedTeam?.id === editingTeam.id) {
          setSelectedTeam(prev => prev ? { ...prev, ...values } : prev);
        }
      }
      setTeamModalOpen(false);
      fetchTeams();
    } catch (err) {
      message.error(apiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTeam(team: Team) {
    try {
      await deleteTeam(team.id);
      message.success('Team deleted');
      if (drawerOpen && selectedTeam?.id === team.id) setDrawerOpen(false);
      fetchTeams();
    } catch (err) {
      message.error(apiError(err));
    }
  }

  // ── Members drawer ────────────────────────────────────────────────────────────

  async function openMembers(team: Team) {
    setDrawerOpen(true);
    setSelectedTeam({ ...team, members: undefined });
    await refreshDrawer(team.id);
  }

  // ── Member actions ────────────────────────────────────────────────────────────

  async function handleAddMember(values: { user_id: string; team_role: TeamRole }) {
    if (!selectedTeam) return;
    setAddingMember(true);
    try {
      await addMember(selectedTeam.id, values);
      message.success('Coach added to team');
      addMemberForm.resetFields();
      await refreshDrawer(selectedTeam.id);
    } catch (err) {
      message.error(apiError(err));
    } finally {
      setAddingMember(false);
    }
  }

  async function handleRoleChange(member: TeamMember, newRole: TeamRole) {
    if (!selectedTeam) return;
    setUpdatingRole(member.user_id);
    try {
      await updateMember(selectedTeam.id, member.user_id, { team_role: newRole });
      message.success('Role updated');
      await refreshDrawer(selectedTeam.id);
    } catch (err) {
      message.error(apiError(err));
    } finally {
      setUpdatingRole(null);
    }
  }

  async function handleRemoveMember(member: TeamMember) {
    if (!selectedTeam) return;
    setRemovingMember(member.user_id);
    try {
      await removeMember(selectedTeam.id, member.user_id);
      message.success(`${member.name} removed from team`);
      await refreshDrawer(selectedTeam.id);
    } catch (err) {
      message.error(apiError(err));
    } finally {
      setRemovingMember(null);
    }
  }

  // ── Table ─────────────────────────────────────────────────────────────────────

  const columns: ColumnsType<Team> = [
    {
      title: 'Team',
      key: 'team',
      render: (_: unknown, team: Team) => (
        <div>
          <Text strong style={{ display: 'block' }}>{team.name}</Text>
          <Space size={4} style={{ marginTop: 4, flexWrap: 'wrap' }}>
            <Tag color={GENDER_COLOR[team.gender]} style={{ fontSize: 11, lineHeight: '18px', margin: 0 }}>
              {team.gender}
            </Tag>
            <Tag style={{ fontSize: 11, lineHeight: '18px', margin: 0 }}>{team.age_group}</Tag>
            <Flex align="center" gap={3}>
              <TeamOutlined style={{ color: '#8c8c8c', fontSize: 11 }} />
              <Text style={{ fontSize: 12, color: '#8c8c8c' }}>{team.member_count}</Text>
            </Flex>
          </Space>
        </div>
      ),
    },
    {
      title: 'Gender',
      dataIndex: 'gender',
      key: 'gender',
      width: 90,
      responsive: ['md'] as ('md')[],
      render: (g: Gender) => <Tag color={GENDER_COLOR[g]}>{g}</Tag>,
    },
    {
      title: 'Age Group',
      dataIndex: 'age_group',
      key: 'age_group',
      width: 100,
      responsive: ['md'] as ('md')[],
      render: (ag: string) => <Tag>{ag}</Tag>,
    },
    {
      title: 'Members',
      dataIndex: 'member_count',
      key: 'member_count',
      width: 90,
      responsive: ['md'] as ('md')[],
      render: (count: number) => (
        <Flex align="center" gap={4}>
          <TeamOutlined style={{ color: '#1677ff' }} />
          <Text>{count}</Text>
        </Flex>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 140,
      render: (_: unknown, team: Team) => (
        <Space size={4}>
          <Button
            type="text" size="small" icon={<TeamOutlined />}
            onClick={() => openMembers(team)}
          >
            Members
          </Button>
          <Button
            type="text" size="small" icon={<EditOutlined />}
            onClick={() => openEdit(team)}
          />
          <Popconfirm
            title={`Delete "${team.name}"?`}
            description="All member assignments will also be removed."
            onConfirm={() => handleDeleteTeam(team)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button type="text" size="small" icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Coaches not yet in the selected team
  const memberUserIds = new Set(selectedTeam?.members?.map(m => m.user_id) ?? []);
  const availableCoaches = coaches.filter(c => !memberUserIds.has(c.id));

  return (
    <div>
      <Flex justify="space-between" align="center" style={{ marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>Teams</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Create Team
        </Button>
      </Flex>

      <Table
        dataSource={teams}
        columns={columns}
        rowKey="id"
        loading={loading}
        scroll={{ x: 500 }}
        pagination={false}
      />

      {/* ── Team create/edit modal ─────────────────────────────────────────── */}
      <Modal
        open={teamModalOpen}
        title={teamModalMode === 'create' ? 'Create Team' : 'Edit Team'}
        onCancel={() => setTeamModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form
          form={teamForm}
          layout="vertical"
          onFinish={handleTeamSubmit}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="name" label="Team Name"
            rules={[{ required: true, message: 'Team name is required' }]}
          >
            <Input placeholder="e.g. Junior Boys A" />
          </Form.Item>

          <Flex gap={12}>
            <Form.Item
              name="gender" label="Gender"
              rules={[{ required: true, message: 'Required' }]}
              style={{ flex: 1 }}
            >
              <Select options={GENDER_OPTIONS} placeholder="Select gender" />
            </Form.Item>

            <Form.Item
              name="age_group" label="Age Group"
              rules={[{ required: true, message: 'Required' }]}
              style={{ flex: 1 }}
            >
              <Select options={AGE_GROUP_OPTIONS} placeholder="Select age group" />
            </Form.Item>
          </Flex>

          <Flex gap={8} justify="flex-end">
            <Button onClick={() => setTeamModalOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={saving}>
              {teamModalMode === 'create' ? 'Create' : 'Save Changes'}
            </Button>
          </Flex>
        </Form>
      </Modal>

      {/* ── Members drawer ─────────────────────────────────────────────────── */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={
          selectedTeam && (
            <Flex align="center" gap={8}>
              <Text strong>{selectedTeam.name}</Text>
              <Tag color={GENDER_COLOR[selectedTeam.gender]}>{selectedTeam.gender}</Tag>
              <Tag>{selectedTeam.age_group}</Tag>
            </Flex>
          )
        }
        width={480}
        destroyOnClose
      >
        {/* Current members */}
        <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
          Members
        </Text>

        <List
          loading={membersLoading}
          dataSource={selectedTeam?.members ?? []}
          locale={{ emptyText: 'No members yet' }}
          renderItem={(member) => (
            <List.Item style={{ display: 'block', padding: '10px 0' }}>
              {/* Row 1: avatar + name + remove button */}
              <Flex align="center" gap={10}>
                <Avatar
                  size={36} icon={<UserOutlined />}
                  style={{ background: '#e6f4ff', color: '#1677ff', flexShrink: 0 }}
                >
                  {member.name[0]?.toUpperCase()}
                </Avatar>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {member.name}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {member.email}
                  </Text>
                </div>
                <Popconfirm
                  title={`Remove ${member.name}?`}
                  onConfirm={() => handleRemoveMember(member)}
                  okText="Remove"
                  okButtonProps={{ danger: true }}
                >
                  <Button
                    type="text" size="small" danger
                    icon={<CloseOutlined />}
                    loading={removingMember === member.user_id}
                    style={{ flexShrink: 0 }}
                  />
                </Popconfirm>
              </Flex>
              {/* Row 2: role select */}
              <div style={{ paddingLeft: 46, marginTop: 6 }}>
                <Select
                  value={member.team_role}
                  size="small"
                  style={{ width: '100%' }}
                  options={ROLE_OPTIONS}
                  loading={updatingRole === member.user_id}
                  onChange={(role) => handleRoleChange(member, role)}
                />
              </div>
            </List.Item>
          )}
          style={{ marginTop: 8, marginBottom: 0 }}
        />

        <Divider style={{ margin: '16px 0' }} />

        {/* Add member form */}
        <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
          Add Coach
        </Text>
        <Form
          form={addMemberForm}
          layout="vertical"
          onFinish={handleAddMember}
          style={{ marginTop: 8 }}
        >
          <Form.Item
            name="user_id" label="Coach"
            rules={[{ required: true, message: 'Select a coach' }]}
          >
            <Select
              showSearch
              placeholder={availableCoaches.length ? 'Select a coach' : 'All coaches are already members'}
              disabled={!availableCoaches.length}
              options={availableCoaches.map(c => ({ value: c.id, label: c.name }))}
              filterOption={(input, option) =>
                (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>

          <Form.Item
            name="team_role" label="Role"
            rules={[{ required: true, message: 'Select a role' }]}
          >
            <Select options={ROLE_OPTIONS} placeholder="Select role" />
          </Form.Item>

          <Button
            type="primary" htmlType="submit"
            loading={addingMember}
            icon={<PlusOutlined />}
            block
          >
            Add to Team
          </Button>
        </Form>
      </Drawer>
    </div>
  );
}
