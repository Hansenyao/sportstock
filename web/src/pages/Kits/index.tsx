import { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Modal, Form, Input, Typography, Space, Popconfirm, App,
  Badge, InputNumber, Divider, Descriptions, Select,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import * as api from '../../api/kits';
import type { KitListItem, Kit, KitItem } from '../../api/kits';
import { listAssetNames } from '../../api/asset-names';
import type { AssetName } from '../../api/asset-names';

const { Title, Text } = Typography;

export default function KitsPage() {
  const { message } = App.useApp();
  const [data, setData] = useState<KitListItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Create/Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<KitListItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [editForm] = Form.useForm();

  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailKit, setDetailKit] = useState<Kit | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Add item form (inside detail modal)
  const [addItemForm] = Form.useForm();
  const [addingItem, setAddingItem] = useState(false);
  const [assetNames, setAssetNames] = useState<AssetName[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.listKits();
      setData(r.data);
    } catch {
      message.error('Failed to load kits');
    } finally { setLoading(false); }
  }, [message]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    listAssetNames().then(r => setAssetNames(r.data)).catch(() => {});
  }, []);

  // ── Create / Edit ──────────────────────────────────────────────
  function openAdd() { setEditing(null); editForm.resetFields(); setEditOpen(true); }
  function openEdit(k: KitListItem) {
    setEditing(k);
    editForm.setFieldsValue({ name: k.name, description: k.description ?? '' });
    setEditOpen(true);
  }

  async function handleSave(values: { name: string; description?: string }) {
    setSaving(true);
    try {
      if (editing) await api.updateKit(editing.id, values);
      else await api.createKit(values);
      message.success(editing ? 'Kit updated.' : 'Kit created.');
      setEditOpen(false);
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed.';
      message.error(msg);
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    try { await api.deleteKit(id); message.success('Kit deleted.'); await load(); }
    catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Cannot delete.';
      message.error(msg);
    }
  }

  // ── Detail ─────────────────────────────────────────────────────
  async function openDetail(k: KitListItem) {
    setDetailKit(null);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const r = await api.getKit(k.id);
      setDetailKit(r.data);
    } catch {
      message.error('Failed to load kit details');
      setDetailOpen(false);
    } finally { setDetailLoading(false); }
  }

  async function refreshDetail(kitId: string) {
    const r = await api.getKit(kitId);
    setDetailKit(r.data);
  }

  async function handleAddItem(values: { asset_type_id: string; quantity: number }) {
    if (!detailKit) return;
    setAddingItem(true);
    try {
      await api.addKitItem(detailKit.id, { asset_type_id: values.asset_type_id, quantity: values.quantity });
      message.success('Item added.');
      addItemForm.resetFields();
      await refreshDetail(detailKit.id);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to add item.';
      message.error(msg);
    } finally { setAddingItem(false); }
  }

  async function handleRemoveItem(itemId: string) {
    if (!detailKit) return;
    try {
      await api.removeKitItem(detailKit.id, itemId);
      message.success('Item removed.');
      await refreshDetail(detailKit.id);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Cannot remove item.';
      message.error(msg);
    }
  }

  // ── Columns ───────────────────────────────────────────────────
  const columns: ColumnsType<KitListItem> = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Description', dataIndex: 'description', key: 'description', render: (d: string | null) => d ?? '—' },
    {
      title: 'Status', dataIndex: 'is_active', key: 'is_active',
      render: (active: boolean) => (
        <Badge status={active ? 'success' : 'default'} text={active ? 'Active' : 'Inactive'} />
      ),
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, k: KitListItem) => (
        <Space>
          <Button size="small" onClick={() => void openDetail(k)}>Details</Button>
          <Button size="small" onClick={() => openEdit(k)}>Edit</Button>
          <Popconfirm title="Delete this kit?" onConfirm={() => void handleDelete(k.id)}>
            <Button size="small" danger>Delete</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const itemColumns: ColumnsType<KitItem> = [
    { title: 'Asset Type', dataIndex: 'asset_type_name', key: 'asset_type_name' },
    { title: 'Qty', dataIndex: 'quantity', key: 'quantity', width: 80 },
    { title: 'Available', dataIndex: 'available_quantity', key: 'available_quantity', width: 100 },
    {
      title: '', key: 'remove', width: 60,
      render: (_: unknown, item: KitItem) => (
        <Popconfirm title="Remove this item?" onConfirm={() => void handleRemoveItem(item.id)}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Kits</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>New Kit</Button>
      </div>
      <Table rowKey="id" dataSource={data} columns={columns} loading={loading} />

      {/* Create / Edit modal */}
      <Modal
        title={editing ? 'Edit Kit' : 'New Kit'}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" onFinish={handleSave} style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea rows={2} /></Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} block>Save</Button>
        </Form>
      </Modal>

      {/* Detail modal */}
      <Modal
        title={detailKit ? `Kit: ${detailKit.name}` : 'Kit Details'}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={600}
        destroyOnClose
      >
        {detailLoading && <Text>Loading…</Text>}
        {detailKit && (
          <>
            <Descriptions size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Name">{detailKit.name}</Descriptions.Item>
              <Descriptions.Item label="Available">
                <Badge
                  status={detailKit.is_available ? 'success' : 'error'}
                  text={detailKit.is_available ? 'Yes' : 'No'}
                />
              </Descriptions.Item>
              {detailKit.description && (
                <Descriptions.Item label="Description" span={2}>{detailKit.description}</Descriptions.Item>
              )}
            </Descriptions>

            <Divider orientation="left" plain>Items</Divider>
            <Table
              rowKey="id"
              dataSource={detailKit.items}
              columns={itemColumns}
              size="small"
              pagination={false}
            />

            <Divider orientation="left" plain>Add Item</Divider>
            <Form form={addItemForm} layout="inline" onFinish={handleAddItem}>
              <Form.Item name="asset_type_id" rules={[{ required: true, message: 'Select asset type' }]}>
                <Select
                  showSearch
                  placeholder="Select asset type"
                  style={{ minWidth: 200 }}
                  filterOption={(input, option) =>
                    String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                  options={assetNames.map(a => ({ value: a.id, label: a.name }))}
                />
              </Form.Item>
              <Form.Item name="quantity" initialValue={1} rules={[{ required: true }]}>
                <InputNumber min={1} max={999} style={{ width: 80 }} />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={addingItem} icon={<PlusOutlined />}>
                  Add
                </Button>
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>
    </div>
  );
}
