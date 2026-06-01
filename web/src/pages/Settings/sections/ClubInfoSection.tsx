import { useEffect, useState } from 'react';
import {
  Card, Descriptions, Form, Input, Select, Button, Flex, Spin, App,
} from 'antd';
import { EditOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { useAuth } from '../../../contexts/AuthContext';
import { getMyClub, updateMyClub, type Club } from '../../../api/clubs';

const SPORT_TYPES = [
  'Football', 'Basketball', 'Swimming', 'Tennis', 'Volleyball',
  'Baseball', 'Rugby', 'Hockey', 'Athletics', 'Other',
];
const SPORT_TYPE_OPTIONS = SPORT_TYPES.map(s => ({ value: s, label: s }));

export default function ClubInfoSection() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const isAdmin = user?.role === 'club_admin';

  const [club, setClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    getMyClub()
      .then(c => { if (active) setClub(c); })
      .catch(() => { if (active) message.error('Failed to load club info'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function startEdit() {
    if (!club) return;
    form.setFieldsValue({
      name:          club.name,
      sport_type:    club.sport_type,
      contact_email: club.contact_email,
      address:       club.address ?? '',
    });
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  async function handleSave(values: {
    name: string;
    sport_type: string;
    contact_email: string;
    address?: string;
  }) {
    setSaving(true);
    const payload = { ...values, address: values.address?.trim() || undefined };
    try {
      const res = await updateMyClub(payload);
      setClub(res.data);
      setEditing(false);
      message.success('Club profile updated');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Failed to save changes';
      message.error(msg);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card style={{ borderRadius: 12, border: 'none', marginBottom: 24 }}>
        <Flex justify="center"><Spin /></Flex>
      </Card>
    );
  }

  return (
    <Card
      title="Club Profile"
      style={{ borderRadius: 12, border: 'none', marginBottom: 24 }}
      extra={isAdmin && !editing && (
        <Button icon={<EditOutlined />} onClick={startEdit}>Edit</Button>
      )}
    >
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
            <Select options={SPORT_TYPE_OPTIONS} />
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
  );
}
