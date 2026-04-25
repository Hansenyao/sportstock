import { useEffect, useState } from 'react';
import {
  Card, Descriptions, Form, Input, Select, Button, Typography,
  Flex, Spin, App,
} from 'antd';
import { EditOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import { getMyClub, updateMyClub, type Club } from '../../api/clubs';

const { Title } = Typography;

const SPORT_TYPES = [
  'Football', 'Basketball', 'Swimming', 'Tennis', 'Volleyball',
  'Baseball', 'Rugby', 'Hockey', 'Athletics', 'Other',
];

export default function ClubProfilePage() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const isAdmin = user?.role === 'club_admin';

  const [club, setClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getMyClub()
      .then(res => setClub(res.data))
      .catch(() => message.error('Failed to load club info'))
      .finally(() => setLoading(false));
  }, [message]);

  function startEdit() {
    if (!club) return;
    form.setFieldsValue({
      name: club.name,
      sport_type: club.sport_type,
      contact_email: club.contact_email,
      address: club.address ?? '',
    });
    setEditing(true);
  }

  function cancelEdit() {
    form.resetFields();
    setEditing(false);
  }

  async function handleSave(values: { name: string; sport_type: string; contact_email: string; address?: string }) {
    setSaving(true);
    try {
      const res = await updateMyClub(values);
      setClub(res.data);
      setEditing(false);
      message.success('Club profile updated');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Failed to save changes';
      message.error(msg);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: 300 }}>
        <Spin size="large" />
      </Flex>
    );
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>Club Profile</Title>
        {isAdmin && !editing && (
          <Button icon={<EditOutlined />} onClick={startEdit}>Edit</Button>
        )}
      </Flex>

      <Card style={{ borderRadius: 12, border: 'none' }}>
        {editing ? (
          <Form form={form} layout="vertical" onFinish={handleSave}>
            <Form.Item
              name="name" label="Club Name"
              rules={[{ required: true, message: 'Club name is required' }]}
            >
              <Input />
            </Form.Item>

            <Form.Item
              name="sport_type" label="Sport Type"
              rules={[{ required: true, message: 'Sport type is required' }]}
            >
              <Select options={SPORT_TYPES.map(s => ({ value: s, label: s }))} />
            </Form.Item>

            <Form.Item
              name="contact_email" label="Contact Email"
              rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
            >
              <Input />
            </Form.Item>

            <Form.Item name="address" label="Address">
              <Input placeholder="City, Country" />
            </Form.Item>

            <Flex gap={8}>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
                Save Changes
              </Button>
              <Button icon={<CloseOutlined />} onClick={cancelEdit} disabled={saving}>
                Cancel
              </Button>
            </Flex>
          </Form>
        ) : (
          <Descriptions column={1} size="middle" bordered={false}>
            <Descriptions.Item label="Club Name">{club?.name ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Sport Type">{club?.sport_type ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Contact Email">{club?.contact_email ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Address">{club?.address || '—'}</Descriptions.Item>
            <Descriptions.Item label="Member Since">
              {club?.created_at ? new Date(club.created_at).toLocaleDateString() : '—'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Card>
    </div>
  );
}
