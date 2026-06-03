import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Switch, Space, Popconfirm, Typography, App } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import * as api from '../../api/admin';
import type { SportType } from '../../api/admin';

const { Title } = Typography;

export default function AdminSettingsPage() {
  const { message } = App.useApp();
  const [data, setData] = useState<SportType[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SportType | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.listAdminSportTypes();
      // Handle both plain array and { data: [...] } wrapper
      const arr = Array.isArray(r.data) ? r.data : (r.data as { data: SportType[] }).data ?? [];
      setData(arr);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function openAdd() { setEditing(null); form.resetFields(); setOpen(true); }
  function openEdit(s: SportType) {
    setEditing(s);
    form.setFieldsValue({ name: s.name, sort_order: s.sort_order, is_active: s.is_active });
    setOpen(true);
  }

  async function handleSave(values: { name: string; sort_order?: number; is_active?: boolean }) {
    setSaving(true);
    try {
      if (editing) await api.updateSportType(editing.id, values);
      else await api.createSportType(values);
      message.success('Saved.');
      setOpen(false);
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed.';
      message.error(msg);
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    try { await api.deleteSportType(id); await load(); message.success('Deleted.'); }
    catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Cannot delete.';
      message.error(msg);
    }
  }

  const columns: ColumnsType<SportType> = [
    { title: 'Name', dataIndex: 'name' },
    { title: 'Sort Order', dataIndex: 'sort_order', width: 120 },
    { title: 'Active', dataIndex: 'is_active', width: 80, render: (v: boolean) => v ? 'Yes' : 'No' },
    {
      title: 'Actions', width: 140,
      render: (_: unknown, s: SportType) => (
        <Space>
          <Button size="small" onClick={() => openEdit(s)}>Edit</Button>
          <Popconfirm title="Delete?" onConfirm={() => void handleDelete(s.id)}>
            <Button size="small" danger>Delete</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Sport Types</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Add</Button>
      </div>
      <Table rowKey="id" dataSource={data} columns={columns} loading={loading} />
      <Modal title={editing ? 'Edit Sport Type' : 'Add Sport Type'} open={open} onCancel={() => setOpen(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleSave} style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="sort_order" label="Sort Order"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
          {editing && <Form.Item name="is_active" label="Active" valuePropName="checked"><Switch /></Form.Item>}
          <Button type="primary" htmlType="submit" loading={saving} block>Save</Button>
        </Form>
      </Modal>
    </div>
  );
}
