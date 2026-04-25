import { useEffect, useState, useCallback } from 'react';
import {
  Table, Button, Tag, Modal, Form, Input, InputNumber, Select,
  Typography, Flex, App, Popconfirm, Space, Row, Col, DatePicker,
  Upload, Avatar, Tooltip,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, UploadOutlined, PictureOutlined, MinusCircleOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
import dayjs from 'dayjs';
import { useAuth } from '../../contexts/AuthContext';
import {
  listAssets, createAsset, updateAsset, deleteAsset,
  listCategories, createCategory, uploadAssetImage,
  type Asset, type AssetStatus, type Category, type AssetFilters,
} from '../../api/assets';
import { createWriteOff } from '../../api/write-offs';

const { Title, Text } = Typography;
const { TextArea } = Input;

const STATUS_OPTIONS = [
  { value: 'available',   label: 'Available',   color: 'success' },
  { value: 'on_loan',     label: 'On Loan',     color: 'processing' },
  { value: 'maintenance', label: 'Maintenance', color: 'warning' },
  { value: 'retired',     label: 'Retired',     color: 'default' },
] as const;

const STATUS_COLOR: Record<AssetStatus, string> = {
  available:   'success',
  on_loan:     'processing',
  maintenance: 'warning',
  retired:     'default',
};

type ModalMode = 'create' | 'edit';

const PAGE_SIZE = 20;

export default function AssetsPage() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const canEdit = user?.role === 'club_admin' || user?.role === 'asset_manager';

  const [assets, setAssets] = useState<Asset[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<AssetFilters>({});

  const [categories, setCategories] = useState<Category[]>([]);
  const [newCatLoading, setNewCatLoading] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [writeOffOpen, setWriteOffOpen] = useState(false);
  const [writeOffAsset, setWriteOffAsset] = useState<Asset | null>(null);
  const [writeOffSaving, setWriteOffSaving] = useState(false);
  const [writeOffForm] = Form.useForm();

  const fetchAssets = useCallback(async (p = page, f = filters) => {
    setLoading(true);
    try {
      const res = await listAssets({ ...f, page: p, limit: PAGE_SIZE });
      setAssets(res.data.data);
      setTotal(res.data.total);
    } catch {
      message.error('Failed to load assets');
    } finally {
      setLoading(false);
    }
  }, [page, filters, message]);

  useEffect(() => {
    fetchAssets();
    listCategories().then(res => setCategories(res.data)).catch(() => { message.error('Failed to load categories'); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function applyFilters(changed: Partial<AssetFilters>) {
    const next = { ...filters, ...changed };
    setFilters(next);
    setPage(1);
    fetchAssets(1, next);
  }

  function openCreate() {
    form.resetFields();
    setModalMode('create');
    setEditingAsset(null);
    setImageFile(null);
    setImagePreview(null);
    setModalOpen(true);
  }

  function openEdit(asset: Asset) {
    setImageFile(null);
    setImagePreview(asset.image_url ?? null);
    form.setFieldsValue({
      name: asset.name,
      category_id: asset.category_id ?? undefined,
      brand: asset.brand ?? '',
      model: asset.model ?? '',
      size: asset.size ?? '',
      purchase_date: asset.purchase_date ? dayjs(asset.purchase_date) : null,
      purchase_price: asset.purchase_price ?? undefined,
      useful_life_years: asset.useful_life_years ?? undefined,
      low_stock_threshold: asset.low_stock_threshold ?? undefined,
      notes: asset.notes ?? '',
      status: asset.status,
    });
    setModalMode('edit');
    setEditingAsset(asset);
    setModalOpen(true);
  }

  async function handleSubmit(values: Record<string, unknown>) {
    setSaving(true);
    try {
      const payload = {
        ...values,
        purchase_date: values.purchase_date
          ? (values.purchase_date as dayjs.Dayjs).format('YYYY-MM-DD')
          : null,
      };

      if (modalMode === 'create') {
        const res = await createAsset(payload);
        if (imageFile) {
          await uploadAssetImage(res.data.id, imageFile).catch(() => {
            message.warning('Asset created, but image upload failed');
          });
        }
        message.success('Asset created');
      } else if (editingAsset) {
        await updateAsset(editingAsset.id, payload);
        if (imageFile) {
          await uploadAssetImage(editingAsset.id, imageFile).catch(() => {
            message.warning('Asset updated, but image upload failed');
          });
        }
        message.success('Asset updated');
      }
      setModalOpen(false);
      fetchAssets();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Operation failed';
      message.error(msg);
    } finally {
      setSaving(false);
    }
  }

  function openWriteOff(asset: Asset) {
    writeOffForm.resetFields();
    writeOffForm.setFieldsValue({ quantity: 1 });
    setWriteOffAsset(asset);
    setWriteOffOpen(true);
  }

  async function handleWriteOff(values: { quantity: number; reason?: string; notes?: string }) {
    if (!writeOffAsset) return;
    setWriteOffSaving(true);
    try {
      await createWriteOff({ asset_id: writeOffAsset.id, ...values });
      message.success(`Write-off recorded for "${writeOffAsset.name}"`);
      setWriteOffOpen(false);
      fetchAssets();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to create write-off';
      message.error(msg);
    } finally {
      setWriteOffSaving(false);
    }
  }

  async function handleDelete(asset: Asset) {
    try {
      await deleteAsset(asset.id);
      message.success(`"${asset.name}" deleted`);
      fetchAssets();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Failed to delete asset';
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

  const columns = [
    {
      title: 'Asset',
      key: 'asset',
      render: (_: unknown, a: Asset) => (
        <Flex align="center" gap={10}>
          {a.image_url ? (
            <Avatar shape="square" size={40} src={a.image_url} />
          ) : (
            <Avatar shape="square" size={40} icon={<PictureOutlined />} style={{ background: '#f0f0f0', color: '#bfbfbf' }} />
          )}
          <div>
            <Text strong style={{ display: 'block' }}>{a.name}</Text>
            <Space size={4}>
              {a.category_name && (
                <Text style={{ fontSize: 12, color: '#8c8c8c' }}>{a.category_name}</Text>
              )}
              {a.size && (
                <Text style={{ fontSize: 12, color: '#1677ff' }}>{a.size}</Text>
              )}
            </Space>
          </div>
        </Flex>
      ),
    },
    {
      title: 'Brand / Model',
      key: 'brand',
      responsive: ['md'] as ('md')[],
      render: (_: unknown, a: Asset) => (
        <Text style={{ color: '#595959' }}>
          {[a.brand, a.model].filter(Boolean).join(' · ') || '—'}
        </Text>
      ),
    },
    {
      title: 'Qty',
      key: 'qty',
      width: 100,
      render: (_: unknown, a: Asset) => (
        <div>
          <Text strong style={{ color: a.available_quantity === 0 ? '#ff4d4f' : 'inherit' }}>
            {a.available_quantity}
          </Text>
          <Text style={{ color: '#8c8c8c' }}> / {a.total_quantity}</Text>
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: AssetStatus) => (
        <Tag color={STATUS_COLOR[status]}>
          {STATUS_OPTIONS.find(s => s.value === status)?.label ?? status}
        </Tag>
      ),
    },
    ...(canEdit ? [{
      title: 'Actions',
      key: 'actions',
      width: 110,
      render: (_: unknown, asset: Asset) => (
        <Space size={4}>
          <Tooltip title="Edit">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(asset)} />
          </Tooltip>
          <Tooltip title="Write Off">
            <Button
              type="text" size="small" icon={<MinusCircleOutlined />}
              style={{ color: '#fa8c16' }}
              onClick={() => openWriteOff(asset)}
              disabled={asset.available_quantity === 0}
            />
          </Tooltip>
          <Popconfirm
            title={`Delete "${asset.name}"?`}
            description="This cannot be undone."
            onConfirm={() => handleDelete(asset)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="Delete">
              <Button type="text" size="small" icon={<DeleteOutlined />} danger />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    }] : []),
  ];

  return (
    <div>
      <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Assets</Title>
        {canEdit && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Add Asset
          </Button>
        )}
      </Flex>

      {/* Filters */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={10} md={8}>
          <Input
            placeholder="Search by name…"
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            allowClear
            onChange={e => applyFilters({ search: e.target.value || undefined })}
          />
        </Col>
        <Col xs={12} sm={7} md={5}>
          <Select
            placeholder="All statuses"
            allowClear
            style={{ width: '100%' }}
            options={STATUS_OPTIONS.map(s => ({ value: s.value, label: s.label }))}
            onChange={v => applyFilters({ status: v })}
          />
        </Col>
        <Col xs={12} sm={7} md={5}>
          <Select
            placeholder="All categories"
            allowClear
            style={{ width: '100%' }}
            options={categoryOptions}
            onChange={v => applyFilters({ category_id: v })}
          />
        </Col>
      </Row>

      <Table
        dataSource={assets}
        columns={columns}
        rowKey="id"
        loading={loading}
        scroll={{ x: 500 }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showTotal: t => `${t} assets`,
          onChange: p => { setPage(p); fetchAssets(p); },
        }}
      />

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        title={modalMode === 'create' ? 'Add Asset' : 'Edit Asset'}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          style={{ marginTop: 16 }}
          initialValues={{ total_quantity: 1, status: 'available' }}
        >
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item
                name="name" label="Asset Name"
                rules={[{ required: true, message: 'Name is required' }]}
              >
                <Input placeholder="e.g. Football" />
              </Form.Item>
            </Col>
            <Col span={8}>
              {modalMode === 'create' && (
                <Form.Item
                  name="total_quantity" label="Quantity"
                  rules={[{ required: true }]}
                >
                  <InputNumber min={1} style={{ width: '100%' }} />
                </Form.Item>
              )}
              {modalMode === 'edit' && (
                <Form.Item name="status" label="Status">
                  <Select options={STATUS_OPTIONS.map(s => ({ value: s.value, label: s.label }))} />
                </Form.Item>
              )}
            </Col>
          </Row>

          <Form.Item name="category_id" label="Category">
            <Select
              placeholder="Select or create a category"
              allowClear
              options={categoryOptions}
              dropdownRender={menu => (
                <>
                  {menu}
                  <div style={{ padding: '8px', borderTop: '1px solid #f0f0f0' }}>
                    <Flex gap={8}>
                      <Input
                        size="small"
                        placeholder="New category name"
                        value={newCatName}
                        onChange={e => setNewCatName(e.target.value)}
                        onKeyDown={e => e.stopPropagation()}
                      />
                      <Button
                        size="small"
                        type="primary"
                        loading={newCatLoading}
                        onClick={handleAddCategory}
                      >
                        Add
                      </Button>
                    </Flex>
                  </div>
                </>
              )}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="brand" label="Brand">
                <Input placeholder="e.g. Nike" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="model" label="Model">
                <Input placeholder="e.g. Flight" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="size" label="Size">
                <Input placeholder="e.g. Size 5" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="purchase_date" label="Purchase Date">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="purchase_price" label="Purchase Price ($)">
                <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="0.00" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="useful_life_years" label="Useful Life (years)">
                <InputNumber min={1} style={{ width: '100%' }} placeholder="e.g. 5" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="low_stock_threshold" label="Low Stock Alert">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="e.g. 2" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="notes" label="Notes">
            <TextArea rows={2} placeholder="Any additional notes…" />
          </Form.Item>

          <Form.Item label="Image (optional)">
            <Upload
              listType="picture-card"
              maxCount={1}
              accept="image/*"
              fileList={imageFile ? [{
                uid: '-1', name: imageFile.name, status: 'done',
                url: imagePreview ?? undefined,
              } as UploadFile] : imagePreview ? [{
                uid: '-1', name: 'current', status: 'done', url: imagePreview,
              } as UploadFile] : []}
              beforeUpload={file => {
                setImageFile(file);
                setImagePreview(URL.createObjectURL(file));
                return false;
              }}
              onRemove={() => {
                setImageFile(null);
                setImagePreview(null);
              }}
            >
              {!imageFile && !imagePreview && (
                <div>
                  <UploadOutlined />
                  <div style={{ marginTop: 8, fontSize: 12 }}>Upload</div>
                </div>
              )}
            </Upload>
          </Form.Item>

          <Flex gap={8} justify="flex-end">
            <Button onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={saving}>
              {modalMode === 'create' ? 'Create Asset' : 'Save Changes'}
            </Button>
          </Flex>
        </Form>
      </Modal>

      {/* Write-off Modal */}
      <Modal
        open={writeOffOpen}
        title={`Write Off — ${writeOffAsset?.name}`}
        onCancel={() => setWriteOffOpen(false)}
        footer={null}
        destroyOnClose
        width={420}
      >
        <Form form={writeOffForm} layout="vertical" onFinish={handleWriteOff} style={{ marginTop: 16 }}>
          <Form.Item name="quantity" label="Quantity to Write Off"
            rules={[{ required: true, message: 'Quantity is required' }]}>
            <InputNumber
              min={1} max={writeOffAsset?.available_quantity ?? 1}
              style={{ width: '100%' }}
            />
          </Form.Item>
          {writeOffAsset && (
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12, marginTop: -8 }}>
              Available: {writeOffAsset.available_quantity} / Total: {writeOffAsset.total_quantity}
            </Text>
          )}
          <Form.Item name="reason" label="Reason (optional)">
            <TextArea rows={2} placeholder="e.g. Damaged beyond repair" />
          </Form.Item>
          <Form.Item name="notes" label="Notes (optional)">
            <TextArea rows={2} />
          </Form.Item>
          <Flex gap={8} justify="flex-end">
            <Button onClick={() => setWriteOffOpen(false)}>Cancel</Button>
            <Button type="primary" danger htmlType="submit" loading={writeOffSaving}
              icon={<MinusCircleOutlined />}>
              Confirm Write-off
            </Button>
          </Flex>
        </Form>
      </Modal>
    </div>
  );
}
