import { useState, useEffect } from 'react';
import { Form, Input, Select, Button, Card, Typography, App } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import * as authApi from '../../api/auth';
import client from '../../api/client';
import type { ClubMembership } from '../../types';

const { Title } = Typography;

export default function CreateClubPage() {
  const navigate = useNavigate();
  const { selectClub, user, updateUserClubs } = useAuth();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [sportTypes, setSportTypes] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    client.get<{ data: Array<{ id: string; name: string }> } | Array<{ id: string; name: string }>>('/sport-types')
      .then(r => {
        const arr = Array.isArray(r.data) ? r.data : (r.data as { data: Array<{ id: string; name: string }> }).data ?? [];
        setSportTypes(arr);
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(values: { name: string; sport_type_id: string; address?: string; contact_email: string }) {
    setLoading(true);
    try {
      const res = await authApi.createClub({ club_name: values.name, sport_type_id: values.sport_type_id, address: values.address, contact_email: values.contact_email });
      const newClub: ClubMembership = { club_id: res.data.club_id, club_name: res.data.club_name, role: 'club_admin' };
      updateUserClubs([...(user?.clubs ?? []), newClub]);
      await selectClub(res.data.club_id);
      message.success(`Club "${res.data.club_name}" created!`);
      navigate('/dashboard');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to create club.';
      message.error(msg);
    } finally { setLoading(false); }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <Title level={4} style={{ marginBottom: 24 }}>Create a New Club</Title>
      <Card>
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="Club Name" rules={[{ required: true }]}>
            <Input size="large" placeholder="e.g. Youth FC Shanghai" />
          </Form.Item>
          <Form.Item name="sport_type_id" label="Sport Type" rules={[{ required: true }]}>
            <Select size="large" placeholder="Select sport type"
              options={sportTypes.map(s => ({ value: s.id, label: s.name }))} />
          </Form.Item>
          <Form.Item name="contact_email" label="Contact Email" rules={[{ required: true, type: 'email' }]}>
            <Input size="large" placeholder="club@example.com" />
          </Form.Item>
          <Form.Item name="address" label="Address">
            <Input size="large" placeholder="Optional" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading} style={{ height: 44 }}>
            Create Club
          </Button>
        </Form>
      </Card>
    </div>
  );
}
