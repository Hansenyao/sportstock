import { useEffect, useState } from 'react';
import {
  Card, Descriptions, Form, Input, Select, Button, Typography,
  Flex, Spin, App, Radio, InputNumber,
} from 'antd';
import { EditOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import { getMyClub, updateMyClub, type Club } from '../../api/clubs';

const { Title, Text } = Typography;

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

  const [alertMode, setAlertMode] = useState<'months' | 'percent'>('percent');
  const [alertValue, setAlertValue] = useState<number>(80);

  useEffect(() => {
    getMyClub()
      .then(c => {
        setClub(c);
        setAlertMode(c.retirement_alert_mode ?? 'percent');
        setAlertValue(c.retirement_alert_value ?? 80);
      })
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
    setAlertMode(club.retirement_alert_mode ?? 'percent');
    setAlertValue(club.retirement_alert_value ?? 80);
    setEditing(true);
  }

  function cancelEdit() {
    if (club) {
      form.setFieldsValue({
        name: club.name,
        sport_type: club.sport_type,
        contact_email: club.contact_email,
        address: club.address ?? '',
      });
      setAlertMode(club.retirement_alert_mode ?? 'percent');
      setAlertValue(club.retirement_alert_value ?? 80);
    }
    setEditing(false);
  }

  async function handleSave(values: {
    name: string;
    sport_type: string;
    contact_email: string;
    address?: string;
  }) {
    setSaving(true);
    try {
      const res = await updateMyClub({
        ...values,
        retirement_alert_mode:  alertMode,
        retirement_alert_value: alertValue,
      });
      setClub(res.data);
      setAlertMode(res.data.retirement_alert_mode ?? 'percent');
      setAlertValue(res.data.retirement_alert_value ?? 80);
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
      <Flex justify="center" align="center" style={{ minHeight: 300 }}>
        <Spin size="large" />
      </Flex>
    );
  }

  const alertModeLabel = alertMode === 'percent' ? 'Life elapsed (%)' : 'Remaining life (months)';
  const alertSummary =
    alertMode === 'percent'
      ? `Alert when ≥ ${alertValue}% of useful life has elapsed`
      : `Alert when ≤ ${alertValue} months of useful life remain`;

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

      <Card
        title="Analytics Alert Thresholds"
        style={{ marginTop: 24, borderRadius: 12, border: 'none' }}
      >
        {editing ? (
          <div>
            <Text style={{ display: 'block', fontWeight: 500, marginBottom: 8 }}>
              Retirement Alert Trigger
            </Text>
            <Radio.Group
              value={alertMode}
              onChange={e => setAlertMode(e.target.value as 'months' | 'percent')}
              style={{ marginBottom: 16 }}
            >
              <Radio value="percent">Life elapsed (%)</Radio>
              <Radio value="months">Remaining life (months)</Radio>
            </Radio.Group>
            <Flex align="center" gap={8}>
              <Text>
                {alertMode === 'percent' ? 'Alert when life elapsed ≥' : 'Alert when remaining months ≤'}
              </Text>
              <InputNumber
                min={1}
                max={alertMode === 'percent' ? 100 : 120}
                value={alertValue}
                onChange={v => setAlertValue(v !== null ? v : alertValue)}
                addonAfter={alertMode === 'percent' ? '%' : 'months'}
                style={{ width: 160 }}
              />
            </Flex>
          </div>
        ) : (
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Retirement Alert Mode">{alertModeLabel}</Descriptions.Item>
            <Descriptions.Item label="Threshold">{alertSummary}</Descriptions.Item>
            <Descriptions.Item label="Low Stock Default">
              {club?.low_stock_threshold ?? 2} units
            </Descriptions.Item>
          </Descriptions>
        )}
      </Card>
    </div>
  );
}
