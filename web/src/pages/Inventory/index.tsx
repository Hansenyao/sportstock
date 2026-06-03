import { useEffect, useState, useCallback } from 'react';
import {
  Table, Button, Tag, Modal, Form, Input, InputNumber, Select,
  Typography, Flex, App, Popconfirm, Space, Row, Col, DatePicker,
  Upload, Avatar, Tooltip, Drawer, Badge, Divider, List,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined,
  UploadOutlined, PictureOutlined, MinusCircleOutlined,
  RetweetOutlined, StopOutlined,
} from '@ant-design/icons';
import type { UploadFile } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useAuth } from '../../contexts/AuthContext';
import {
  listAssets, createAsset, updateAsset, deleteAsset,
  listCategories, uploadAssetImage,
  addBatch, updateBatch,
  getAssetItems, updateAssetItem, retireItem, writeOffItem,
  retireByQuantity, writeOffByQuantity,
  type AssetType, type AssetBatch, type AssetStatus, type Category,
  type AssetFilters, type AssetItem,
} from '../../api/assets';
import { listAssetNames, type AssetName } from '../../api/asset-names';
import { createWriteOff } from '../../api/write-offs';
import { listWarehouses, type Warehouse } from '../../api/warehouses';

const { Title, Text } = Typography;
const { TextArea } = Input;

const STATUS_OPTIONS = [
  { value: 'available',   label: 'Available',   color: 'success'    },
  { value: 'on_loan',     label: 'On Loan',     color: 'processing' },
  { value: 'maintenance', label: 'Maintenance', color: 'warning'    },
  { value: 'retired',     label: 'Retired',     color: 'default'    },
] as const;

const STATUS_COLOR: Record<AssetStatus, string> = {
  available:   'success',
  on_loan:     'processing',
  maintenance: 'warning',
  retired:     'default',
};

// AssetItem status includes 'written_off' in addition to AssetStatus
const ITEM_STATUS_COLOR: Record<AssetItem['status'], string> = {
  available:   'success',
  on_loan:     'processing',
  maintenance: 'warning',
  retired:     'default',
  written_off: 'error',
};

const ITEM_STATUS_LABEL: Record<AssetItem['status'], string> = {
  available:   'Available',
  on_loan:     'On Loan',
  maintenance: 'Maintenance',
  retired:     'Retired',
  written_off: 'Written Off',
};

type ModalMode = 'create' | 'editType' | 'addBatch';
const PAGE_SIZE = 20;

export default function InventoryPage() {
  const { user, activeClub } = useAuth();
  const { message, modal } = App.useApp();
  const canEdit = activeClub?.role === 'club_admin' || activeClub?.role === 'asset_manager';

  // List state
  const [assets, setAssets]       = useState<AssetType[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(true);
  const [filters, setFilters]     = useState<AssetFilters>({});
  const [expandedRows, setExpandedRows] = useState<string[]>([]);

  // Reference data
  const [categories, setCategories]   = useState<Category[]>([]);
  const [assetNames, setAssetNames]   = useState<AssetName[]>([]);
  const [warehouses, setWarehouses]   = useState<Warehouse[]>([]);

  // Modal
  const [modalOpen, setModalOpen]   = useState(false);
  const [modalMode, setModalMode]   = useState<ModalMode>('create');
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [editingType, setEditingType]   = useState<AssetType | null>(null);
  const [targetTypeId, setTargetTypeId] = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);
  const [typeForm]  = Form.useForm();
  const [batchForm] = Form.useForm();
  const [editBatchForm] = Form.useForm();

  // Batch edit
  const [editBatchOpen, setEditBatchOpen]     = useState(false);
  const [editingBatch, setEditingBatch]       = useState<AssetBatch | null>(null);
  const [editingBatchTypeId, setEditingBatchTypeId] = useState<string | null>(null);
  const [editBatchSaving, setEditBatchSaving] = useState(false);

  // Image
  const [imageFile, setImageFile]       = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Write-off
  const [writeOffOpen, setWriteOffOpen]   = useState(false);
  const [writeOffType, setWriteOffType]   = useState<AssetType | null>(null);
  const [writeOffSaving, setWriteOffSaving] = useState(false);
  const [writeOffForm] = Form.useForm();

  // ── Asset Items Drawer ────────────────────────────────────────────────────────

  const [itemsDrawerOpen, setItemsDrawerOpen]     = useState(false);
  const [itemsDrawerType, setItemsDrawerType]     = useState<AssetType | null>(null);
  const [assetItems, setAssetItems]               = useState<AssetItem[]>([]);
  const [itemsLoading, setItemsLoading]           = useState(false);

  // Item edit modal
  const [editItemOpen, setEditItemOpen]   = useState(false);
  const [editingItem, setEditingItem]     = useState<AssetItem | null>(null);
  const [editItemSaving, setEditItemSaving] = useState(false);
  const [editItemForm] = Form.useForm();

  // Batch retire / write-off
  const [batchRetireOpen, setBatchRetireOpen]     = useState(false);
  const [batchWriteOffOpen, setBatchWriteOffOpen] = useState(false);
  const [batchActionSaving, setBatchActionSaving] = useState(false);
  const [batchRetireForm]   = Form.useForm();
  const [batchWriteOffForm] = Form.useForm();

  // ── Data loading ──────────────────────────────────────────────────────────────

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
    listCategories()
      .then(res => setCategories(res.data))
      .catch(() => message.error('Failed to load categories'));
    listAssetNames()
      .then(res => setAssetNames(res.data))
      .catch(() => message.error('Failed to load asset names'));
    listWarehouses()
      .then(res => setWarehouses(res.data.items))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function applyFilters(changed: Partial<AssetFilters>) {
    const next = { ...filters, ...changed };
    setFilters(next);
    setPage(1);
    fetchAssets(1, next);
  }

  // ── Items Drawer ──────────────────────────────────────────────────────────────

  async function openItemsDrawer(type: AssetType) {
    setItemsDrawerType(type);
    setItemsDrawerOpen(true);
    setItemsLoading(true);
    try {
      const res = await getAssetItems(type.id);
      setAssetItems(res.data);
    } catch {
      message.error('Failed to load asset items');
    } finally {
      setItemsLoading(false);
    }
  }

  async function reloadItems() {
    if (!itemsDrawerType) return;
    setItemsLoading(true);
    try {
      const res = await getAssetItems(itemsDrawerType.id);
      setAssetItems(res.data);
    } catch {
      message.error('Failed to reload items');
    } finally {
      setItemsLoading(false);
    }
  }

  function openEditItem(item: AssetItem) {
    editItemForm.setFieldsValue({
      warehouse_id:  item.warehouse_id,
      serial_number: item.serial_number ?? '',
      notes:         item.notes ?? '',
    });
    setEditingItem(item);
    setEditItemOpen(true);
  }

  async function handleEditItem(values: { warehouse_id?: string; serial_number?: string; notes?: string }) {
    if (!editingItem) return;
    setEditItemSaving(true);
    try {
      await updateAssetItem(editingItem.id, {
        warehouse_id:  values.warehouse_id,
        serial_number: values.serial_number || undefined,
        notes:         values.notes || undefined,
      });
      message.success('Item updated');
      setEditItemOpen(false);
      reloadItems();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Failed to update item';
      message.error(msg);
    } finally {
      setEditItemSaving(false);
    }
  }

  async function handleRetireItem(item: AssetItem) {
    try {
      await retireItem(item.id);
      message.success('Item retired');
      reloadItems();
      fetchAssets();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Failed to retire item';
      message.error(msg);
    }
  }

  async function handleWriteOffItem(item: AssetItem) {
    modal.confirm({
      title: 'Write Off Item',
      content: (
        <div>
          <p>Enter a reason for writing off this item:</p>
          <Input.TextArea id="writeoff-reason-input" rows={3} />
        </div>
      ),
      onOk: async () => {
        const reason = (document.getElementById('writeoff-reason-input') as HTMLTextAreaElement)?.value ?? '';
        try {
          await writeOffItem(item.id, reason);
          message.success('Item written off');
          reloadItems();
          fetchAssets();
        } catch (err: unknown) {
          const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
            ?? 'Failed to write off item';
          message.error(msg);
          throw err;
        }
      },
    });
  }

  // Count items without serial numbers that are available for batch actions
  const unserializedCount = assetItems.filter(
    i => !i.serial_number && i.status === 'available'
  ).length;

  async function handleBatchRetire(values: { quantity: number; notes?: string }) {
    if (!itemsDrawerType) return;
    setBatchActionSaving(true);
    try {
      await retireByQuantity(itemsDrawerType.id, values.quantity, values.notes);
      message.success(`${values.quantity} item(s) retired`);
      setBatchRetireOpen(false);
      batchRetireForm.resetFields();
      reloadItems();
      fetchAssets();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Failed to retire items';
      message.error(msg);
    } finally {
      setBatchActionSaving(false);
    }
  }

  async function handleBatchWriteOff(values: { quantity: number; reason: string }) {
    if (!itemsDrawerType) return;
    setBatchActionSaving(true);
    try {
      await writeOffByQuantity(itemsDrawerType.id, values.quantity, values.reason);
      message.success(`${values.quantity} item(s) written off`);
      setBatchWriteOffOpen(false);
      batchWriteOffForm.resetFields();
      reloadItems();
      fetchAssets();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Failed to write off items';
      message.error(msg);
    } finally {
      setBatchActionSaving(false);
    }
  }

  // ── Asset Type Modal open helpers ─────────────────────────────────────────────

  function openCreate() {
    typeForm.resetFields();
    batchForm.resetFields();
    batchForm.setFieldsValue({ total_quantity: 1 });
    setImageFile(null);
    setImagePreview(null);
    setModalMode('create');
    setCreateStep(1);
    setEditingType(null);
    setTargetTypeId(null);
    setModalOpen(true);
  }

  function openEditType(type: AssetType) {
    typeForm.setFieldsValue({
      asset_name_id:      type.asset_name_id,
      brand:              type.brand ?? '',
      model:              type.model ?? '',
      size:               type.size ?? '',
      low_stock_threshold: type.low_stock_threshold ?? undefined,
    });
    setImageFile(null);
    setImagePreview(type.image_url ?? null);
    setModalMode('editType');
    setEditingType(type);
    setTargetTypeId(null);
    setModalOpen(true);
  }

  function openAddBatch(type: AssetType) {
    batchForm.resetFields();
    batchForm.setFieldsValue({ total_quantity: 1 });
    setTargetTypeId(type.id);
    setModalMode('addBatch');
    setModalOpen(true);
  }

  function openEditBatch(type: AssetType, batch: AssetBatch) {
    editBatchForm.setFieldsValue({
      purchase_date:     batch.purchase_date ? dayjs(batch.purchase_date) : null,
      purchase_price:    batch.purchase_price ?? null,
      useful_life_years: batch.useful_life_years ?? null,
      notes:             batch.notes ?? '',
    });
    setEditingBatch(batch);
    setEditingBatchTypeId(type.id);
    setEditBatchOpen(true);
  }

  async function handleEditBatch(values: {
    purchase_date?: dayjs.Dayjs | null;
    purchase_price?: number | null;
    useful_life_years?: number | null;
    notes?: string;
  }) {
    if (!editingBatch || !editingBatchTypeId) return;
    setEditBatchSaving(true);
    try {
      await updateBatch(editingBatchTypeId, editingBatch.id, {
        purchase_date:     values.purchase_date
          ? (values.purchase_date as dayjs.Dayjs).format('YYYY-MM-DD') : null,
        purchase_price:    values.purchase_price ?? null,
        useful_life_years: values.useful_life_years ?? null,
        notes:             values.notes || null,
      });
      message.success('Batch updated');
      setEditBatchOpen(false);
      fetchAssets();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Failed to update batch';
      message.error(msg);
    } finally {
      setEditBatchSaving(false);
    }
  }

  // ── Modal submit ──────────────────────────────────────────────────────────────

  async function handleModalSubmit() {
    if (modalMode === 'create' && createStep === 1) {
      try { await typeForm.validateFields(); } catch { return; }
      setCreateStep(2);
      return;
    }

    setSaving(true);
    try {
      if (modalMode === 'create') {
        const typeVals  = typeForm.getFieldsValue();
        const batchVals = await batchForm.validateFields();

        const res = await createAsset({
          asset_name_id:       typeVals.asset_name_id,
          brand:               typeVals.brand || null,
          model:               typeVals.model || null,
          size:                typeVals.size  || null,
          low_stock_threshold: typeVals.low_stock_threshold ?? null,
          total_quantity:      batchVals.total_quantity,
          purchase_date:       batchVals.purchase_date
            ? (batchVals.purchase_date as dayjs.Dayjs).format('YYYY-MM-DD') : null,
          purchase_price:      batchVals.purchase_price ?? null,
          useful_life_years:   batchVals.useful_life_years ?? null,
          notes:               batchVals.notes || null,
        });
        if (imageFile) {
          await uploadAssetImage(res.data.id, imageFile).catch(() => {
            message.warning('Asset created, but image upload failed');
          });
        }
        message.success('Asset created');

      } else if (modalMode === 'editType' && editingType) {
        const values = await typeForm.validateFields();
        await updateAsset(editingType.id, {
          asset_name_id:       values.asset_name_id,
          brand:               values.brand || null,
          model:               values.model || null,
          size:                values.size  || null,
          low_stock_threshold: values.low_stock_threshold ?? null,
        });
        if (imageFile) {
          await uploadAssetImage(editingType.id, imageFile).catch(() => {
            message.warning('Asset updated, but image upload failed');
          });
        }
        message.success('Asset type updated');

      } else if (modalMode === 'addBatch' && targetTypeId) {
        const values = await batchForm.validateFields();
        await addBatch(targetTypeId, {
          total_quantity:    values.total_quantity,
          purchase_date:     values.purchase_date
            ? (values.purchase_date as dayjs.Dayjs).format('YYYY-MM-DD') : null,
          purchase_price:    values.purchase_price ?? null,
          useful_life_years: values.useful_life_years ?? null,
          notes:             values.notes || null,
        });
        message.success('Batch added');
      }

      setModalOpen(false);
      fetchAssets();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Operation failed';
      message.error(msg);
    } finally {
      setSaving(false);
    }
  }

  // ── Write-off ─────────────────────────────────────────────────────────────────

  function openWriteOff(type: AssetType) {
    writeOffForm.resetFields();
    writeOffForm.setFieldsValue({ quantity: 1 });
    setWriteOffType(type);
    setWriteOffOpen(true);
  }

  async function handleWriteOff(values: { quantity: number; reason?: string; notes?: string }) {
    if (!writeOffType) return;
    setWriteOffSaving(true);
    try {
      await createWriteOff({ asset_type_id: writeOffType.id, ...values });
      message.success(`Write-off recorded for "${writeOffType.name}"`);
      setWriteOffOpen(false);
      fetchAssets();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Failed to create write-off';
      message.error(msg);
    } finally {
      setWriteOffSaving(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  async function handleDelete(type: AssetType) {
    try {
      await deleteAsset(type.id);
      message.success(`"${type.name}" deleted`);
      fetchAssets();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Failed to delete asset';
      message.error(msg);
    }
  }

  const categoryOptions  = categories.map(c => ({ value: c.id, label: c.name }));
  const assetNameOptions = assetNames.map(n => ({ value: n.id, label: n.name }));
  const warehouseOptions = warehouses.map(w => ({ value: w.id, label: w.name }));

  // ── Expanded row: batch list ──────────────────────────────────────────────────

  function renderExpandedRow(type: AssetType) {
    if (!type.batches?.length) {
      return <Text type="secondary" style={{ paddingLeft: 52, display: 'block', paddingBottom: 8 }}>No batches</Text>;
    }

    const batchCols: ColumnsType<AssetBatch> = [
      {
        title: 'Purchase Date',
        dataIndex: 'purchase_date',
        key: 'purchase_date',
        render: (d: string | null) => d ? dayjs(d).format('MMM D, YYYY') : <Text type="secondary">—</Text>,
      },
      {
        title: 'Price',
        dataIndex: 'purchase_price',
        key: 'purchase_price',
        width: 90,
        render: (p: number | null) => p != null
          ? <Text>${Number(p).toFixed(2)}</Text>
          : <Text type="secondary">—</Text>,
      },
      {
        title: 'Qty (avail/total)',
        key: 'qty',
        width: 140,
        render: (_: unknown, b: AssetBatch) => (
          <span>
            <Text strong style={{ color: b.available_quantity === 0 ? '#ff4d4f' : undefined }}>
              {b.available_quantity}
            </Text>
            <Text type="secondary"> / {b.total_quantity}</Text>
          </span>
        ),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        width: 110,
        render: (s: AssetStatus) => (
          <Tag color={STATUS_COLOR[s]} style={{ fontSize: 11 }}>
            {STATUS_OPTIONS.find(o => o.value === s)?.label ?? s}
          </Tag>
        ),
      },
      ...(canEdit ? [{
        title: '',
        key: 'batchActions',
        width: 60,
        render: (_: unknown, b: AssetBatch) => (
          <Tooltip title="Edit Batch">
            <Button type="text" size="small" icon={<EditOutlined />}
              onClick={() => openEditBatch(type, b)} />
          </Tooltip>
        ),
      }] : []),
    ];

    return (
      <div style={{ padding: '4px 0 12px 52px' }}>
        <Table
          dataSource={type.batches}
          columns={batchCols}
          rowKey="id"
          size="small"
          pagination={false}
          style={{ maxWidth: 640 }}
        />
      </div>
    );
  }

  // ── Table columns ─────────────────────────────────────────────────────────────

  const columns: ColumnsType<AssetType> = [
    {
      title: 'Asset',
      key: 'asset',
      render: (_: unknown, type: AssetType) => (
        <Flex align="center" gap={10}>
          {type.image_url ? (
            <Avatar shape="square" size={40} src={type.image_url} />
          ) : (
            <Avatar shape="square" size={40} icon={<PictureOutlined />}
              style={{ background: '#f0f0f0', color: '#bfbfbf' }} />
          )}
          <div>
            <Text strong style={{ display: 'block' }}>{type.name}</Text>
            <Space size={4}>
              {type.category_name && (
                <Text style={{ fontSize: 12, color: '#8c8c8c' }}>{type.category_name}</Text>
              )}
              {type.size && (
                <Text style={{ fontSize: 12, color: '#1677ff' }}>{type.size}</Text>
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
      render: (_: unknown, type: AssetType) => (
        <Text style={{ color: '#595959' }}>
          {[type.brand, type.model].filter(Boolean).join(' · ') || '—'}
        </Text>
      ),
    },
    {
      title: 'Qty',
      key: 'qty',
      width: 110,
      render: (_: unknown, type: AssetType) => (
        <div>
          <Text strong style={{ color: type.available_quantity === 0 ? '#ff4d4f' : 'inherit' }}>
            {type.available_quantity}
          </Text>
          <Text style={{ color: '#8c8c8c' }}> / {type.total_quantity}</Text>
          {Number(type.batch_count) > 1 && (
            <Text style={{ fontSize: 11, color: '#8c8c8c', display: 'block' }}>
              {type.batch_count} batches
            </Text>
          )}
        </div>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 120,
      render: (_: unknown, type: AssetType) => (
        <Tag color={STATUS_COLOR[type.status]}>
          {STATUS_OPTIONS.find(s => s.value === type.status)?.label ?? type.status}
        </Tag>
      ),
    },
    ...(canEdit ? [{
      title: 'Actions',
      key: 'actions',
      width: 130,
      render: (_: unknown, type: AssetType) => (
        <Space size={4}>
          <Tooltip title="Edit Type">
            <Button type="text" size="small" icon={<EditOutlined />}
              onClick={e => { e.stopPropagation(); openEditType(type); }} />
          </Tooltip>
          <Tooltip title="Add Batch">
            <Button type="text" size="small" icon={<PlusOutlined />}
              style={{ color: '#1677ff' }}
              onClick={e => { e.stopPropagation(); openAddBatch(type); }} />
          </Tooltip>
          <Tooltip title="Write Off">
            <Button
              type="text" size="small" icon={<MinusCircleOutlined />}
              style={{ color: '#fa8c16' }}
              onClick={e => { e.stopPropagation(); openWriteOff(type); }}
              disabled={type.available_quantity === 0}
            />
          </Tooltip>
          <Popconfirm
            title={`Delete "${type.name}"?`}
            description="This cannot be undone."
            onConfirm={() => handleDelete(type)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="Delete">
              <Button type="text" size="small" icon={<DeleteOutlined />} danger
                onClick={e => e.stopPropagation()} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    }] : []),
  ];

  // ── Modal title & button label ────────────────────────────────────────────────

  const modalTitle =
    modalMode === 'create'   ? (createStep === 1 ? 'Add Asset — Type Info' : 'Add Asset — Batch Details')
    : modalMode === 'editType' ? 'Edit Asset Type'
    : 'Add Batch';

  const submitLabel =
    modalMode === 'create' && createStep === 1 ? 'Next →'
    : modalMode === 'create'   ? 'Create Asset'
    : modalMode === 'editType' ? 'Save Changes'
    : 'Add Batch';

  // ── Type form (Step 1 / Edit Type) ────────────────────────────────────────────

  const typeFormContent = (
    <Form form={typeForm} layout="vertical" style={{ marginTop: 8 }}>
      <Form.Item name="asset_name_id" label="Asset Name"
        rules={[{ required: true, message: 'Please select an asset name' }]}>
        <Select
          showSearch
          placeholder="Select from catalog…"
          options={assetNameOptions}
          filterOption={(input, option) =>
            String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
        />
      </Form.Item>

      <Row gutter={16}>
        <Col span={8}>
          <Form.Item name="brand" label="Brand"
            rules={[{ required: true, message: 'Brand is required' }]}>
            <Input placeholder="e.g. Nike" />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="model" label="Model">
            <Input placeholder="e.g. Flight" />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="size" label="Size"
            rules={[{ required: true, message: 'Size is required' }]}>
            <Input placeholder="e.g. Size 5" />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item name="low_stock_threshold" label="Low Stock Alert">
        <InputNumber min={0} style={{ width: '100%' }} placeholder="e.g. 2" />
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
          onRemove={() => { setImageFile(null); setImagePreview(null); }}
        >
          {!imageFile && !imagePreview && (
            <div><UploadOutlined /><div style={{ marginTop: 8, fontSize: 12 }}>Upload</div></div>
          )}
        </Upload>
      </Form.Item>
    </Form>
  );

  // ── Batch form (Step 2 / Add Batch) ──────────────────────────────────────────

  const batchFormContent = (
    <Form form={batchForm} layout="vertical" style={{ marginTop: 8 }}
      initialValues={{ total_quantity: 1 }}>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name="total_quantity" label="Quantity"
            rules={[{ required: true, message: 'Quantity is required' }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="purchase_date" label="Purchase Date"
            rules={[{ required: true, message: 'Purchase date is required' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name="purchase_price" label="Purchase Price ($)"
            rules={[{ required: true, message: 'Purchase price is required' }]}>
            <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="0.00" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="useful_life_years" label="Useful Life (years)"
            rules={[{ required: true, message: 'Useful life is required' }]}>
            <InputNumber min={1} style={{ width: '100%' }} placeholder="e.g. 5" />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item name="notes" label="Notes (optional)">
        <TextArea rows={2} />
      </Form.Item>
    </Form>
  );

  // ── Asset Items Drawer columns ────────────────────────────────────────────────

  const itemColumns: ColumnsType<AssetItem> = [
    {
      title: 'Serial #',
      dataIndex: 'serial_number',
      key: 'serial_number',
      render: (sn: string | null | undefined) =>
        sn ? <Text code style={{ fontSize: 12 }}>{sn}</Text> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Warehouse',
      dataIndex: 'warehouse_name',
      key: 'warehouse_name',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (s: AssetItem['status']) => (
        <Badge status={ITEM_STATUS_COLOR[s] as 'success' | 'processing' | 'warning' | 'default' | 'error'}
          text={<Text style={{ fontSize: 12 }}>{ITEM_STATUS_LABEL[s]}</Text>}
        />
      ),
    },
    {
      title: 'Notes',
      dataIndex: 'notes',
      key: 'notes',
      responsive: ['md'] as ('md')[],
      render: (n: string | null | undefined) =>
        n ? <Text style={{ fontSize: 12 }}>{n}</Text> : <Text type="secondary">—</Text>,
    },
    ...(canEdit ? [{
      title: 'Actions',
      key: 'item_actions',
      width: 110,
      render: (_: unknown, item: AssetItem) => (
        <Space size={4}>
          <Tooltip title="Edit">
            <Button type="text" size="small" icon={<EditOutlined />}
              onClick={() => openEditItem(item)} />
          </Tooltip>
          {item.status !== 'retired' && item.status !== 'written_off' && (
            <Popconfirm
              title="Retire this item?"
              description="The item will be marked as retired."
              onConfirm={() => handleRetireItem(item)}
              okText="Retire"
            >
              <Tooltip title="Retire">
                <Button type="text" size="small" icon={<RetweetOutlined />}
                  style={{ color: '#faad14' }} />
              </Tooltip>
            </Popconfirm>
          )}
          {item.status !== 'written_off' && (
            <Tooltip title="Write Off">
              <Button type="text" size="small" icon={<StopOutlined />}
                style={{ color: '#ff4d4f' }}
                onClick={() => handleWriteOffItem(item)} />
            </Tooltip>
          )}
        </Space>
      ),
    }] : []),
  ];

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div>
      <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Inventory</Title>
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
        onRow={record => ({
          onClick: () => openItemsDrawer(record),
          style: { cursor: 'pointer' },
        })}
        expandable={{
          expandedRowKeys: expandedRows,
          onExpand: (expanded, record) =>
            setExpandedRows(expanded ? [record.id] : []),
          expandedRowRender: renderExpandedRow,
        }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showTotal: t => `${t} assets`,
          onChange: p => { setPage(p); fetchAssets(p); },
        }}
      />

      {/* ── Asset Items Drawer ─────────────────────────────────────────────── */}
      <Drawer
        open={itemsDrawerOpen}
        onClose={() => setItemsDrawerOpen(false)}
        title={
          itemsDrawerType ? (
            <Flex align="center" gap={8}>
              {itemsDrawerType.image_url
                ? <Avatar shape="square" size={28} src={itemsDrawerType.image_url} />
                : <Avatar shape="square" size={28} icon={<PictureOutlined />}
                    style={{ background: '#f0f0f0', color: '#bfbfbf' }} />
              }
              <span>{itemsDrawerType.name} — Individual Items</span>
            </Flex>
          ) : 'Asset Items'
        }
        placement="right"
        width={720}
      >
        <Table
          dataSource={assetItems}
          columns={itemColumns}
          rowKey="id"
          loading={itemsLoading}
          size="small"
          pagination={false}
          scroll={{ x: 400 }}
        />

        {/* Batch actions for unserialized items */}
        {canEdit && unserializedCount > 0 && (
          <>
            <Divider />
            <div style={{ marginBottom: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {unserializedCount} item{unserializedCount > 1 ? 's' : ''} without serial numbers (available for batch actions)
              </Text>
            </div>
            <Flex gap={8}>
              <Button
                icon={<RetweetOutlined />}
                onClick={() => {
                  batchRetireForm.resetFields();
                  batchRetireForm.setFieldsValue({ quantity: 1 });
                  setBatchRetireOpen(true);
                }}
              >
                Retire N Items
              </Button>
              <Button
                danger
                icon={<StopOutlined />}
                onClick={() => {
                  batchWriteOffForm.resetFields();
                  batchWriteOffForm.setFieldsValue({ quantity: 1 });
                  setBatchWriteOffOpen(true);
                }}
              >
                Write Off N Items
              </Button>
            </Flex>
          </>
        )}
      </Drawer>

      {/* ── Edit Item Modal ────────────────────────────────────────────────── */}
      <Modal
        open={editItemOpen}
        title="Edit Asset Item"
        onCancel={() => setEditItemOpen(false)}
        footer={null}
        destroyOnClose
        width={420}
      >
        <Form form={editItemForm} layout="vertical" onFinish={handleEditItem} style={{ marginTop: 16 }}>
          <Form.Item name="warehouse_id" label="Warehouse">
            <Select placeholder="Select warehouse" options={warehouseOptions} />
          </Form.Item>
          <Form.Item name="serial_number" label="Serial Number (optional)">
            <Input placeholder="e.g. SN-12345" />
          </Form.Item>
          <Form.Item name="notes" label="Notes (optional)">
            <TextArea rows={2} />
          </Form.Item>
          <Flex gap={8} justify="flex-end">
            <Button onClick={() => setEditItemOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={editItemSaving} icon={<EditOutlined />}>
              Save Changes
            </Button>
          </Flex>
        </Form>
      </Modal>

      {/* ── Batch Retire Modal ─────────────────────────────────────────────── */}
      <Modal
        open={batchRetireOpen}
        title={`Retire Items — ${itemsDrawerType?.name}`}
        onCancel={() => setBatchRetireOpen(false)}
        footer={null}
        destroyOnClose
        width={380}
      >
        <Form form={batchRetireForm} layout="vertical" onFinish={handleBatchRetire} style={{ marginTop: 16 }}>
          <Form.Item name="quantity" label="Quantity to Retire"
            rules={[{ required: true, message: 'Quantity is required' }]}>
            <InputNumber min={1} max={unserializedCount} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="Notes (optional)">
            <TextArea rows={2} />
          </Form.Item>
          <Flex gap={8} justify="flex-end">
            <Button onClick={() => setBatchRetireOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={batchActionSaving}
              icon={<RetweetOutlined />}>
              Confirm Retire
            </Button>
          </Flex>
        </Form>
      </Modal>

      {/* ── Batch Write-Off Modal ──────────────────────────────────────────── */}
      <Modal
        open={batchWriteOffOpen}
        title={`Write Off Items — ${itemsDrawerType?.name}`}
        onCancel={() => setBatchWriteOffOpen(false)}
        footer={null}
        destroyOnClose
        width={380}
      >
        <Form form={batchWriteOffForm} layout="vertical" onFinish={handleBatchWriteOff} style={{ marginTop: 16 }}>
          <Form.Item name="quantity" label="Quantity to Write Off"
            rules={[{ required: true, message: 'Quantity is required' }]}>
            <InputNumber min={1} max={unserializedCount} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="reason" label="Reason"
            rules={[{ required: true, message: 'Reason is required' }]}>
            <TextArea rows={2} placeholder="e.g. Damaged beyond repair" />
          </Form.Item>
          <Flex gap={8} justify="flex-end">
            <Button onClick={() => setBatchWriteOffOpen(false)}>Cancel</Button>
            <Button type="primary" danger htmlType="submit" loading={batchActionSaving}
              icon={<StopOutlined />}>
              Confirm Write-off
            </Button>
          </Flex>
        </Form>
      </Modal>

      {/* ── Create / Edit / Add Batch Modal ───────────────────────────────────── */}
      <Modal
        open={modalOpen}
        title={modalTitle}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={600}
        destroyOnClose
      >
        <div style={{ display: ((modalMode === 'create' && createStep === 1) || modalMode === 'editType') ? undefined : 'none' }}>
          {(modalMode === 'create' || modalMode === 'editType') && typeFormContent}
        </div>
        <div style={{ display: ((modalMode === 'create' && createStep === 2) || modalMode === 'addBatch') ? undefined : 'none' }}>
          {(modalMode === 'create' || modalMode === 'addBatch') && batchFormContent}
        </div>

        <Flex gap={8} justify="flex-end" style={{ marginTop: 16 }}>
          {modalMode === 'create' && createStep === 2 && (
            <Button onClick={() => setCreateStep(1)}>← Back</Button>
          )}
          <Button onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button type="primary" loading={saving} onClick={handleModalSubmit}>
            {submitLabel}
          </Button>
        </Flex>
      </Modal>

      {/* ── Edit Batch Modal ──────────────────────────────────────────────────── */}
      <Modal
        open={editBatchOpen}
        title="Edit Batch"
        onCancel={() => setEditBatchOpen(false)}
        footer={null}
        destroyOnClose
        width={480}
      >
        <Form form={editBatchForm} layout="vertical" onFinish={handleEditBatch} style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="purchase_date" label="Purchase Date"
                rules={[{ required: true, message: 'Purchase date is required' }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="purchase_price" label="Purchase Price ($)"
                rules={[{ required: true, message: 'Purchase price is required' }]}>
                <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="0.00" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="useful_life_years" label="Useful Life (years)"
                rules={[{ required: true, message: 'Useful life is required' }]}>
                <InputNumber min={1} style={{ width: '100%' }} placeholder="e.g. 5" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="Notes (optional)">
            <TextArea rows={2} />
          </Form.Item>
          <Flex gap={8} justify="flex-end">
            <Button onClick={() => setEditBatchOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={editBatchSaving}
              icon={<EditOutlined />}>
              Save Changes
            </Button>
          </Flex>
        </Form>
      </Modal>

      {/* ── Write-off Modal ────────────────────────────────────────────────────── */}
      <Modal
        open={writeOffOpen}
        title={`Write Off — ${writeOffType?.name}`}
        onCancel={() => setWriteOffOpen(false)}
        footer={null}
        destroyOnClose
        width={420}
      >
        <Form form={writeOffForm} layout="vertical" onFinish={handleWriteOff} style={{ marginTop: 16 }}>
          <Form.Item name="quantity" label="Quantity to Write Off"
            rules={[{ required: true, message: 'Quantity is required' }]}>
            <InputNumber
              min={1} max={writeOffType?.available_quantity ?? 1}
              style={{ width: '100%' }}
            />
          </Form.Item>
          {writeOffType && (
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12, marginTop: -8 }}>
              Available: {writeOffType.available_quantity} / Total: {writeOffType.total_quantity}
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
