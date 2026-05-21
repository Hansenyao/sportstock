// frontend/src/admin/pages/ClubDetail/tabs/UsersTab.tsx
import { useEffect, useState, useCallback } from 'react';
import { Table, Tag, Button, Space, App, Typography } from 'antd';
import { listClubUsers, updateUserStatus, resetUserPassword } from '../../../api/admin';

const { Text } = Typography;

interface User {
  id: string; name: string; email: string; role: string;
  is_active: boolean; email_verified: boolean; created_at: string;
}

export default function UsersTab({ clubId }: { clubId: string }) {
  const { message, modal } = App.useApp();
  const [data,    setData]    = useState<User[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await listClubUsers(clubId, { page: p, limit: 20 });
      setData(res.data as unknown as User[]);
      setTotal(res.total);
    } catch { message.error('Failed to load users'); }
    finally { setLoading(false); }
  }, [clubId, message]);

  useEffect(() => { fetch(page); }, [page, fetch]);

  const handleToggleStatus = (user: User) => {
    const action = user.is_active ? 'disable' : 'enable';
    modal.confirm({
      title: `${user.is_active ? 'Disable' : 'Enable'} User`,
      content: `${action.charAt(0).toUpperCase() + action.slice(1)} account for ${user.email}?`,
      okButtonProps: { danger: user.is_active },
      onOk: async () => {
        try {
          await updateUserStatus(clubId, user.id, !user.is_active);
          message.success('User status updated');
          fetch(page);
        } catch {
          message.error(`Failed to ${action} user`);
        }
      },
    });
  };

  const handleResetPassword = (user: User) => {
    modal.confirm({
      title: 'Reset Password',
      content: `Generate a temporary password for ${user.email}?`,
      onOk: async () => {
        try {
          const { temp_password } = await resetUserPassword(clubId, user.id);
          modal.info({
            title: 'Temporary Password',
            content: (
              <div>
                <Text>Share this password with the user:</Text>
                <br />
                <Text code copyable style={{ fontSize: 16, marginTop: 8, display: 'block' }}>
                  {temp_password}
                </Text>
              </div>
            ),
          });
        } catch {
          message.error('Failed to reset password');
        }
      },
    });
  };

  const columns = [
    { title: 'Name',  dataIndex: 'name',  key: 'name' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Role',  dataIndex: 'role',  key: 'role',
      render: (v: string) => <Tag>{v.replace('_', ' ')}</Tag> },
    { title: 'Status', dataIndex: 'is_active', key: 'is_active',
      render: (v: boolean) => <Tag color={v ? 'success' : 'error'}>{v ? 'Active' : 'Disabled'}</Tag> },
    { title: 'Actions', key: 'actions',
      render: (_: unknown, r: User) => (
        <Space>
          <Button size="small" danger={r.is_active} onClick={() => handleToggleStatus(r)}>
            {r.is_active ? 'Disable' : 'Enable'}
          </Button>
          <Button size="small" onClick={() => handleResetPassword(r)}>
            Reset Password
          </Button>
        </Space>
      ) },
  ];

  return (
    <Table
      dataSource={data}
      columns={columns}
      rowKey="id"
      loading={loading}
      pagination={{ current: page, pageSize: 20, total, onChange: setPage, showSizeChanger: false }}
      size="small"
    />
  );
}
