import { useEffect, useState } from 'react';
import {
  Table, Button, Tag, Modal, Form, Input, Select,
  Typography, Flex, App, Popconfirm, Space, Divider, Empty,
} from 'antd';
import { PlusOutlined, EditOutlined, StopOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import {
  listUsers, getUser, createUser, updateUser, deactivateUser, type ClubUser,
} from '../../api/users';
import type { UserRole } from '../../types';
import type { UserTeamMembership, TeamRole } from '../../api/teams';

const { Title } = Typography;

const ROLE_OPTIONS = [
  { value: 'club_admin',    label: 'Admin' },
  { value: 'asset_manager', label: 'Asset Manager' },
  { value: 'coach',         label: 'Coach' },
];

const ROLE_COLOR: Record<string, string> = {
  club_admin: 'blue',
  asset_manager: 'cyan',
  coach: 'green',
};

const TEAM_ROLE_LABEL: Record<TeamRole, string> = {
  head_coach: 'Head Coach',
  assistant_coach: 'Assistant Coach',
  team_manager: 'Team Manager',
};

const TEAM_ROLE_COLOR: Record<TeamRole, string> = {
  head_coach: 'gold',
  assistant_coach: 'blue',
  team_manager: 'cyan',
};

type ModalMode = 'create' | 'edit';

export default function UsersPage() {
  const { user: me } = useAuth();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const isAdmin = me?.role === 'club_admin';

  const [users, setUsers] = useState<ClubUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [editingUser, setEditingUser] = useState<ClubUser | null>(null);
  const [saving, setSaving] = useState(false);

  // Coach detail modal (team memberships)
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailUser, setDetailUser] = useState<ClubUser | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const PAGE_SIZE = 20;

  async function fetchUsers(p = page) {
    setLoading(true);
    try {
      const res = await listUsers({ page: p, limit: PAGE_SIZE });
      setUsers(res.data.data);
      setTotal(res.data.total);
    } catch {
      message.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchUsers(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate() {
    form.resetFields();
    setModalMode('create');
    setEditingUser(null);
    setModalOpen(true);
  }

  function openEdit(u: ClubUser) {
    form.setFieldsValue({ name: u.name, phone: u.phone ?? '', role: u.role });
    setModalMode('edit');
    setEditingUser(u);
    setModalOpen(true);
  }

  async function handleSubmit(values: { name: string; email: string; role: UserRole; phone?: string }) {
    setSaving(true);
    try {
      if (modalMode === 'create') {
        await createUser(values);
        message.success('User created. A temporary password has been sent to their email.');
      } else if (editingUser) {
        await updateUser(editingUser.id, { name: values.name, phone: values.phone, role: values.role });
        message.success('User updated');
      }
      setModalOpen(false);
      fetchUsers();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Operation failed';
      message.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function openDetail(u: ClubUser) {
    setDetailOpen(true);
    setDetailUser(u);
    setDetailLoading(true);
    try {
      const res = await getUser(u.id);
      setDetailUser(res.data);
    } catch {
      message.error('Failed to load user details');
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleDeactivate(u: ClubUser) {
    try {
      await deactivateUser(u.id);
      message.success(`${u.name} has been deactivated`);
      fetchUsers();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Failed to deactivate user';
      message.error(msg);
    }
  }

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      ellipsis: true,
    },
    {
      title: 'Phone',
      dataIndex: 'phone',
      key: 'phone',
      render: (v: string | null) => v || '—',
      responsive: ['md'] as ('md')[],
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => (
        <Tag color={ROLE_COLOR[role] ?? 'default'}>
          {ROLE_OPTIONS.find(r => r.value === role)?.label ?? role}
        </Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean) => (
        <Tag color={active ? 'success' : 'default'}>{active ? 'Active' : 'Inactive'}</Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 130,
      render: (_: unknown, u: ClubUser) => (
        <Space size={4}>
          {u.role === 'coach' && (
            <Button
              type="text" size="small" icon={<InfoCircleOutlined />}
              onClick={() => openDetail(u)}
            />
          )}
          {isAdmin && (
            <Button
              type="text" size="small" icon={<EditOutlined />}
              onClick={() => openEdit(u)}
            />
          )}
          {isAdmin && u.is_active && u.id !== me?.id && (
            <Popconfirm
              title={`Deactivate ${u.name}?`}
              description="They will no longer be able to log in."
              onConfirm={() => handleDeactivate(u)}
              okText="Deactivate"
              okButtonProps={{ danger: true }}
            >
              <Button type="text" size="small" icon={<StopOutlined />} danger />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Flex justify="space-between" align="center" style={{ marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>Users</Title>
        {isAdmin && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Add User
          </Button>
        )}
      </Flex>

      <Table
        dataSource={users}
        columns={columns}
        rowKey="id"
        loading={loading}
        scroll={{ x: 600 }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showTotal: (t) => `${t} users`,
          onChange: (p) => { setPage(p); fetchUsers(p); },
        }}
      />

      {/* ── Coach detail modal (team memberships) ─────────────────────── */}
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

            <Divider orientation="left" orientationMargin={0} style={{ fontSize: 13 }}>
              Team Assignments
            </Divider>

            {!detailUser?.teams?.length ? (
              <Empty description="Not assigned to any team" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {(detailUser.teams as UserTeamMembership[]).map(t => (
                  <Flex key={t.team_id} justify="space-between" align="center"
                    style={{ padding: '8px 12px', background: '#fafafa', borderRadius: 6 }}
                  >
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

      {/* ── Create / Edit user modal ───────────────────────────────────── */}
      <Modal
        open={modalOpen}
        title={modalMode === 'create' ? 'Add User' : 'Edit User'}
        onCancel={() => setModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          style={{ marginTop: 16 }}
          initialValues={{ role: 'coach' }}
        >
          <Form.Item
            name="name" label="Full Name"
            rules={[{ required: true, message: 'Name is required' }]}
          >
            <Input placeholder="e.g. John Smith" />
          </Form.Item>

          {modalMode === 'create' && (
            <Form.Item
              name="email" label="Email"
              rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
            >
              <Input placeholder="user@example.com" />
            </Form.Item>
          )}

          <Form.Item
            name="role" label="Role"
            rules={[{ required: true }]}
          >
            <Select options={ROLE_OPTIONS} />
          </Form.Item>

          <Form.Item name="phone" label="Phone (optional)">
            <Input placeholder="+1 234 567 8900" />
          </Form.Item>

          <Flex gap={8} justify="flex-end">
            <Button onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={saving}>
              {modalMode === 'create' ? 'Create User' : 'Save Changes'}
            </Button>
          </Flex>
        </Form>
      </Modal>
    </div>
  );
}
