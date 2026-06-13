import { useEffect, useState } from 'react';
import {
  Card, Descriptions, Form, Input, Select, Button, Flex, Spin, App, Avatar, Upload,
} from 'antd';
import { EditOutlined, SaveOutlined, CloseOutlined, CameraOutlined, TeamOutlined } from '@ant-design/icons';
import { useAuth } from '../../../contexts/AuthContext';
import { getMyClub, updateMyClub, uploadLogo, type Club } from '../../../api/clubs';

const SPORT_TYPES = [
  'Football', 'Basketball', 'Swimming', 'Tennis', 'Volleyball',
  'Baseball', 'Rugby', 'Hockey', 'Athletics', 'Other',
];
const SPORT_TYPE_OPTIONS = SPORT_TYPES.map(s => ({ value: s, label: s }));

export default function ClubInfoSection() {
  const { activeClub } = useAuth();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const isAdmin = activeClub?.role === 'club_admin';

  const [club, setClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getMyClub()
      .then(c => {
        if (active) {
          setClub(c);
          setLogoPreview(c.logo_url ?? null);
        }
      })
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
    setLogoFile(null);
    setEditing(true);
  }

  function cancelEdit() {
    setLogoFile(null);
    setLogoPreview(club?.logo_url ?? null);
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
      if (logoFile) {
        try {
          const logoRes = await uploadLogo(logoFile);
          setLogoPreview(logoRes.data.logo_url);
          setClub(prev => prev ? { ...prev, logo_url: logoRes.data.logo_url } : prev);
        } catch {
          message.warning('Club info saved, but logo upload failed');
        }
      }
      setLogoFile(null);
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
          <Form.Item label="Club Logo">
            <Upload
              accept="image/*"
              showUploadList={false}
              beforeUpload={file => {
                setLogoFile(file);
                setLogoPreview(URL.createObjectURL(file));
                return false;
              }}
            >
              <div style={{ cursor: 'pointer', position: 'relative', width: 80, height: 80 }}>
                <Avatar
                  size={80}
                  src={logoPreview ?? undefined}
                  icon={<TeamOutlined />}
                  shape="square"
                  style={{ backgroundColor: '#1677ff' }}
                />
                <div style={{
                  position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)',
                  borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <CameraOutlined style={{ color: '#fff', fontSize: 20 }} />
                </div>
              </div>
            </Upload>
          </Form.Item>
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
        <>
          {logoPreview && (
            <div style={{ marginBottom: 16 }}>
              <Avatar
                size={72}
                src={logoPreview}
                shape="square"
                style={{ borderRadius: 8 }}
              />
            </div>
          )}
          <Descriptions column={1} size="middle" bordered={false}>
            <Descriptions.Item label="Club Name">{club?.name ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Sport Type">{club?.sport_type ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Contact Email">{club?.contact_email ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Address">{club?.address || '—'}</Descriptions.Item>
            <Descriptions.Item label="Member Since">
              {club?.created_at ? new Date(club.created_at).toLocaleDateString() : '—'}
            </Descriptions.Item>
          </Descriptions>
        </>
      )}
    </Card>
  );
}
