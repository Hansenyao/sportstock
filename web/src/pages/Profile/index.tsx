import { useState, useEffect } from 'react';
import { Form, Input, Button, Card, Typography, Divider, App, Avatar, Upload, Flex } from 'antd';
import { UserOutlined, CameraOutlined } from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import * as authApi from '../../api/auth';
import { uploadMyAvatar } from '../../api/users';

const { Title, Text } = Typography;

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { message } = App.useApp();
  const [profileForm] = Form.useForm();
  const [pwForm] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatar_url ?? null);

  useEffect(() => {
    if (user) {
      profileForm.setFieldsValue({
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone ?? '',
      });
      setAvatarPreview(user.avatar_url ?? null);
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
      if (avatarFile) {
        try {
          const res = await uploadMyAvatar(avatarFile);
          setAvatarPreview(res.data.avatar_url);
          await refreshUser();
        } catch {
          message.warning('Profile saved, but avatar upload failed.');
        }
        setAvatarFile(null);
      }
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

  const initials = user
    ? `${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.toUpperCase()
    : '';

  return (
    <div style={{ maxWidth: 560 }}>
      <Title level={4} style={{ marginBottom: 24 }}>Profile</Title>
      <Card style={{ marginBottom: 24 }}>
        <Form form={profileForm} layout="vertical" onFinish={handleSaveProfile}>
          <Form.Item label="Photo">
            <Flex align="center" gap={16}>
              <Upload
                accept="image/*"
                showUploadList={false}
                beforeUpload={file => {
                  setAvatarFile(file);
                  setAvatarPreview(URL.createObjectURL(file));
                  return false;
                }}
              >
                <div style={{ cursor: 'pointer', position: 'relative', width: 80, height: 80 }}>
                  <Avatar
                    size={80}
                    src={avatarPreview ?? undefined}
                    icon={!avatarPreview ? <UserOutlined /> : undefined}
                    style={{ backgroundColor: '#1677ff' }}
                  >
                    {!avatarPreview && initials}
                  </Avatar>
                  <div style={{
                    position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)',
                    borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <CameraOutlined style={{ color: '#fff', fontSize: 20 }} />
                  </div>
                </div>
              </Upload>
              <Text type="secondary" style={{ fontSize: 12 }}>Click to change photo</Text>
            </Flex>
          </Form.Item>
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
