import { useState, useEffect } from 'react';
import { Form, Input, Button, Card, Typography, Divider, App } from 'antd';
import { useAuth } from '../../contexts/AuthContext';
import * as authApi from '../../api/auth';

const { Title, Text } = Typography;

export default function ProfilePage() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const [profileForm] = Form.useForm();
  const [pwForm] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    if (user) {
      profileForm.setFieldsValue({
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone ?? '',
      });
    }
  }, [user, profileForm]);

  async function handleSaveProfile(values: { first_name: string; last_name: string; phone?: string }) {
    setSaving(true);
    try {
      await authApi.updateProfile({
        first_name: values.first_name,
        last_name: values.last_name,
        phone: values.phone || null,
      });
      message.success('Profile updated.');
    } catch {
      message.error('Failed to update profile.');
    } finally { setSaving(false); }
  }

  async function handleChangePassword(values: { current_password: string; new_password: string; confirm: string }) {
    if (values.new_password !== values.confirm) { message.error('Passwords do not match.'); return; }
    setSavingPw(true);
    try {
      await authApi.changePassword(values.current_password, values.new_password);
      message.success('Password changed.');
      pwForm.resetFields();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed.';
      message.error(msg);
    } finally { setSavingPw(false); }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <Title level={4} style={{ marginBottom: 24 }}>Profile</Title>
      <Card style={{ marginBottom: 24 }}>
        <Form form={profileForm} layout="vertical" onFinish={handleSaveProfile}>
          <Form.Item label="Email">
            <Text type="secondary">{user?.email}</Text>
          </Form.Item>
          <Form.Item name="first_name" label="First Name" rules={[{ required: true }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item name="last_name" label="Last Name" rules={[{ required: true }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input size="large" placeholder="+1 555 000 0000" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>Save Changes</Button>
        </Form>
      </Card>

      <Card>
        <Title level={5}>Change Password</Title>
        <Divider style={{ margin: '12px 0 20px' }} />
        <Form form={pwForm} layout="vertical" onFinish={handleChangePassword}>
          <Form.Item name="current_password" label="Current Password" rules={[{ required: true }]}>
            <Input.Password size="large" />
          </Form.Item>
          <Form.Item name="new_password" label="New Password" rules={[{ required: true, min: 6 }]}>
            <Input.Password size="large" />
          </Form.Item>
          <Form.Item name="confirm" label="Confirm New Password" rules={[{ required: true }]}>
            <Input.Password size="large" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={savingPw}>Change Password</Button>
        </Form>
      </Card>
    </div>
  );
}
