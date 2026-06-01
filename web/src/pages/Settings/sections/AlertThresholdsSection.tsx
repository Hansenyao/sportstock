import { useEffect, useState } from 'react';
import {
  Card, Descriptions, Radio, InputNumber, Button, Flex, Spin, App, Form,
} from 'antd';
import { EditOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { useAuth } from '../../../contexts/AuthContext';
import { getMyClub, updateMyClub, type Club } from '../../../api/clubs';

export default function AlertThresholdsSection() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const [form] = Form.useForm<{
    retirement_alert_mode:  'percent' | 'months';
    retirement_alert_value: number;
    low_stock_threshold:    number;
  }>();
  const isAdmin = user?.role === 'club_admin';

  const [club, setClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const alertMode = Form.useWatch('retirement_alert_mode', form) ?? 'percent';

  useEffect(() => {
    let active = true;
    getMyClub()
      .then(c => { if (active) setClub(c); })
      .catch(() => { if (active) message.error('Failed to load alert thresholds'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function startEdit() {
    if (!club) return;
    form.setFieldsValue({
      retirement_alert_mode:  club.retirement_alert_mode   ?? 'percent',
      retirement_alert_value: club.retirement_alert_value  ?? 80,
      low_stock_threshold:    club.low_stock_threshold     ?? 2,
    });
    setEditing(true);
  }

  function cancelEdit() {
    form.resetFields();
    setEditing(false);
  }

  async function handleSave(values: {
    retirement_alert_mode:  'percent' | 'months';
    retirement_alert_value: number;
    low_stock_threshold:    number;
  }) {
    setSaving(true);
    try {
      const res = await updateMyClub(values);
      setClub(res.data);
      setEditing(false);
      message.success('Alert thresholds updated');
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
      <Card title="Analytics Alert Thresholds" style={{ borderRadius: 12, border: 'none' }}>
        <Flex justify="center"><Spin /></Flex>
      </Card>
    );
  }

  const viewMode    = club?.retirement_alert_mode   ?? 'percent';
  const viewValue   = club?.retirement_alert_value  ?? 80;
  const alertModeLabel = viewMode === 'percent' ? 'Life elapsed (%)' : 'Remaining life (months)';
  const alertSummary   =
    viewMode === 'percent'
      ? `Alert when ≥ ${viewValue}% of useful life has elapsed`
      : `Alert when ≤ ${viewValue} months of useful life remain`;

  return (
    <Card
      title="Analytics Alert Thresholds"
      style={{ borderRadius: 12, border: 'none' }}
      extra={isAdmin && !editing && (
        <Button icon={<EditOutlined />} onClick={startEdit}>Edit</Button>
      )}
    >
      {editing ? (
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="retirement_alert_mode" label="Retirement Alert Trigger">
            <Radio.Group onChange={() => form.setFieldValue('retirement_alert_value', undefined)}>
              <Radio value="percent">Life elapsed (%)</Radio>
              <Radio value="months">Remaining life (months)</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item
            name="retirement_alert_value"
            label="Threshold"
            rules={[{
              required: true,
              type: 'number',
              min: 1,
              max: alertMode === 'percent' ? 100 : 120,
              message: alertMode === 'percent' ? 'Must be between 1 and 100' : 'Must be between 1 and 120',
            }]}
          >
            <InputNumber
              min={1}
              max={alertMode === 'percent' ? 100 : 120}
              addonAfter={alertMode === 'percent' ? '%' : 'months'}
              style={{ width: 160 }}
            />
          </Form.Item>
          <Form.Item
            name="low_stock_threshold"
            label="Low Stock Default (units)"
            rules={[{ required: true, type: 'number', min: 1, message: 'Must be at least 1' }]}
          >
            <InputNumber min={1} addonAfter="units" style={{ width: 160 }} />
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
        <Descriptions column={1} size="middle">
          <Descriptions.Item label="Retirement Alert Mode">{alertModeLabel}</Descriptions.Item>
          <Descriptions.Item label="Threshold">{alertSummary}</Descriptions.Item>
          <Descriptions.Item label="Low Stock Default">
            {club?.low_stock_threshold ?? 2} units
          </Descriptions.Item>
        </Descriptions>
      )}
    </Card>
  );
}
