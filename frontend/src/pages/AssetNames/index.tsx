import { useEffect, useState, useCallback } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Typography, Flex, App, Popconfirm, Space, Tooltip,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  listAssetNames, createAssetName, updateAssetName, deleteAssetName,
  type AssetName,
} from '../../api/asset-names';
import { listCategories, createCategory, type Category } from '../../api/assets';

const { Title, Text } = Typography;

export default function AssetNamesPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const [names, setNames] = useState<AssetName[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AssetName | null>(null);
  const [saving, setSaving] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [newCatName, setNewCatName] = useState('');
  const [newCatLoading, setNewCatLoading] = useState(false);

  const fetchNames = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAssetNames();
      setNames(res.data);
    } catch {
      message.error('Failed to load asset names');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    fetchNames();
    listCategories()
      .then(res => setCategories(res.data))
      .catch(() => message.error('Failed to load categories'));
  }, []); // eslint-disable-line

  function openCreate() {
    form.resetFields();
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(record: AssetName) {
    form.setFieldsValue({ name: record.name, category_id: record.category_id ?? undefined });
    setEditing(record);
    setModalOpen(true);
  }

  async function handleSubmit({ name, category_id }: { name: string; category_id?: string }) {
    setSaving(true);
    try {
      if (editing) {
        await updateAssetName(editing.id, name, category_id ?? null);
        message.success('Asset name updated');
      } else {
        await createAssetName(name, category_id ?? null);
        message.success('Asset name created');
      }
      setModalOpen(false);
      fetchNames();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Operation failed';
      message.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(record: AssetName) {
    try {
      await deleteAssetName(record.id);
      message.success(`"${record.name}" deleted`);
      fetchNames();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Failed to delete';
      message.error(msg);
    }
  }

  async function handleAddCategory() {
    if (!newCatName.trim()) return;
    setNewCatLoading(true);
    try {
      const res = await createCategory(newCatName.trim());
      setCategories(prev => [...prev, res.data]);
      setNewCatName('');
      message.success('Category added');
    } catch {
      message.error('Failed to add category');
    } finally {
      setNewCatLoading(false);
    }
  }

  const categoryOptions = categories.map(c => ({ value: c.id, label: c.name }));

  const columns: ColumnsType<AssetName> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Category',
      dataIndex: 'category_name',
      key: 'category_name',
      width: 160,
      render: (cat: string | null) => cat
        ? <Text style={{ color: '#595959' }}>{cat}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'Asset Types',
      dataIndex: 'type_count',
      key: 'type_count',
      width: 120,
      render: (count: number) => (
        <Text style={{ color: '#8c8c8c' }}>{Number(count) || 0} type{Number(count) !== 1 ? 's' : ''}</Text>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 140,
      responsive: ['md'] as ('md')[],
      render: (d: string) => <Text style={{ fontSize: 12 }}>{dayjs(d).format('MMM D, YYYY')}</Text>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 90,
      render: (_: unknown, record: AssetName) => (
        <Space size={4}>
          <Tooltip title="Edit">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          </Tooltip>
          <Popconfirm
            title={`Delete "${record.name}"?`}
            description={
              Number(record.type_count) > 0
                ? 'This name has active asset types and cannot be deleted.'
                : 'This cannot be undone.'
            }
            onConfirm={() => handleDelete(record)}
            okText="Delete"
            okButtonProps={{ danger: true }}
            disabled={Number(record.type_count) > 0}
          >
            <Tooltip title={Number(record.type_count) > 0 ? 'Has active asset types' : 'Delete'}>
              <Button
                type="text" size="small" icon={<DeleteOutlined />} danger
                disabled={Number(record.type_count) > 0}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Asset Names</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Approved name catalog — assets can only be created using names from this list.
          </Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Add Name
        </Button>
      </Flex>

      <Table
        dataSource={names}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
        scroll={{ x: 500 }}
      />

      <Modal
        open={modalOpen}
        title={editing ? 'Edit Asset Name' : 'New Asset Name'}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={420}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} style={{ marginTop: 16 }}>
          <Form.Item
            name="name" label="Name"
            rules={[{ required: true, message: 'Name is required' }]}
          >
            <Input placeholder="e.g. Football, Training Jersey, Cone…" />
          </Form.Item>

          <Form.Item name="category_id" label="Category">
            <Select
              placeholder="Select or create a category"
              allowClear
              options={categoryOptions}
              dropdownRender={menu => (
                <>
                  {menu}
                  <div style={{ padding: 8, borderTop: '1px solid #f0f0f0' }}>
                    <Flex gap={8}>
                      <Input
                        size="small"
                        placeholder="New category name"
                        value={newCatName}
                        onChange={e => setNewCatName(e.target.value)}
                        onKeyDown={e => e.stopPropagation()}
                      />
                      <Button size="small" type="primary" loading={newCatLoading} onClick={handleAddCategory}>
                        Add
                      </Button>
                    </Flex>
                  </div>
                </>
              )}
            />
          </Form.Item>

          <Flex gap={8} justify="flex-end">
            <Button onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={saving}>
              {editing ? 'Save Changes' : 'Create'}
            </Button>
          </Flex>
        </Form>
      </Modal>
    </div>
  );
}
