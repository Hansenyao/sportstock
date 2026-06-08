import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, Typography, Space, Popconfirm, App } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import * as api from '../../api/warehouses';
import type { Warehouse } from '../../api/warehouses';

const { Title } = Typography;

export default function WarehousesPage() {
  const { message } = App.useApp();
  const [data, setData] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.listWarehouses();
      // WarehouseListResult has { items: Warehouse[], auto_select: boolean }
      setData(r.data.items);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function openAdd() { setEditing(null); form.resetFields(); setModalOpen(true); }
  function openEdit(w: Warehouse) { setEditing(w); form.setFieldsValue({ name: w.name, description: w.description ?? '', address: w.address ?? '' }); setModalOpen(true); }

  async function handleSave(values: { name: string; description?: string; address?: string }) {
    setSaving(true);
    try {
      if (editing) await api.updateWarehouse(editing.id, values);
      else await api.createWarehouse(values);
      message.success(editing ? 'Warehouse updated.' : 'Warehouse created.');
      setModalOpen(false);
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed.';
      message.error(msg);
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    try { await api.deleteWarehouse(id); message.success('Deleted.'); await load(); }
    catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Cannot delete.';
      message.error(msg);
    }
  }

  const columns: ColumnsType<Warehouse> = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Description', dataIndex: 'description', key: 'description', render: (d: string | null) => d ?? '—' },
    { title: 'Address', dataIndex: 'address', key: 'address', render: (a: string | null) => a ?? '—' },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, w: Warehouse) => (
        <Space>
          <Button size="small" onClick={() => openEdit(w)}>Edit</Button>
          <Popconfirm title="Delete this warehouse?" onConfirm={() => void handleDelete(w.id)}>
            <Button size="small" danger>Delete</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Warehouses</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Add Warehouse</Button>
      </div>
      <Table rowKey="id" dataSource={data} columns={columns} loading={loading} />

      <Modal title={editing ? 'Edit Warehouse' : 'Add Warehouse'} open={modalOpen} onCancel={() => setModalOpen(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleSave} style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="address" label="Address"><Input placeholder="e.g. Building A, Room 101" /></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea rows={2} /></Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} block>Save</Button>
        </Form>
      </Modal>
    </div>
  );
}
