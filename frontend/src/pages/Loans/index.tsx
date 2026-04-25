import { useEffect, useState, useCallback } from 'react';
import {
  Table, Button, Tag, Modal, Form, Input, InputNumber, Select,
  Typography, Flex, App, Space, Avatar, Tabs, DatePicker,
  Popconfirm, Radio, Row, Col,
} from 'antd';
import {
  PlusOutlined, PictureOutlined, CheckOutlined, CloseOutlined,
  SendOutlined, ArrowDownOutlined, EditOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useAuth } from '../../contexts/AuthContext';
import {
  listLoans, createLoan, updateLoan, approveLoan, rejectLoan, checkoutLoan,
  initiateReturn, confirmReturn,
  type Loan, type LoanStatus, type ReturnCondition,
} from '../../api/loans';
import { listAssets, type Asset } from '../../api/assets';
import { listUsers, type ClubUser } from '../../api/users';

const { Title, Text } = Typography;
const { TextArea } = Input;

const STATUS_TABS = [
  { key: 'all',         label: 'All' },
  { key: 'pending',     label: 'Pending' },
  { key: 'approved',    label: 'Approved' },
  { key: 'checked_out', label: 'Checked Out' },
  { key: 'returned',    label: 'Returned' },
  { key: 'rejected',    label: 'Rejected' },
] as const;

const STATUS_COLOR: Record<LoanStatus, string> = {
  pending:     'orange',
  approved:    'blue',
  rejected:    'red',
  checked_out: 'purple',
  returned:    'green',
};

const STATUS_LABEL: Record<LoanStatus, string> = {
  pending:     'Pending',
  approved:    'Approved',
  rejected:    'Rejected',
  checked_out: 'Checked Out',
  returned:    'Returned',
};

const CONDITION_OPTIONS = [
  { value: 'good',          label: 'Good' },
  { value: 'minor_damage',  label: 'Minor Damage' },
  { value: 'severe_damage', label: 'Severe Damage' },
];

const PAGE_SIZE = 20;

export default function LoansPage() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [rejectForm] = Form.useForm();
  const [returnForm] = Form.useForm();

  const isManager = user?.role === 'club_admin' || user?.role === 'asset_manager';
  const isCoach = user?.role === 'coach';

  const [loans, setLoans] = useState<Loan[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('all');

  const [assets, setAssets] = useState<Asset[]>([]);
  const [coaches, setCoaches] = useState<ClubUser[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [editing, setEditing] = useState(false);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);

  const [returnOpen, setReturnOpen] = useState(false);
  const [returningLoan, setReturningLoan] = useState<Loan | null>(null);
  const [confirming, setConfirming] = useState(false);

  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const fetchLoans = useCallback(async (p = page, tab = activeTab) => {
    setLoading(true);
    try {
      const params = {
        page: p,
        limit: PAGE_SIZE,
        ...(tab !== 'all' ? { status: tab as LoanStatus } : {}),
      };
      const res = await listLoans(params);
      setLoans(res.data.data);
      setTotal(res.data.total);
    } catch {
      message.error('Failed to load loans');
    } finally {
      setLoading(false);
    }
  }, [page, activeTab, message]);

  useEffect(() => {
    fetchLoans();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Pre-load assets and coaches for create modal
    listAssets({ limit: 200 }).then(r => setAssets(r.data.data)).catch(() => {});
    if (isManager) {
      listUsers({ role: 'coach', limit: 200 }).then(r => setCoaches(r.data.data)).catch(() => {});
    }
  }, [isManager]);

  function handleTabChange(key: string) {
    setActiveTab(key);
    setPage(1);
    fetchLoans(1, key);
  }

  function setLoading1(id: string, val: boolean) {
    setActionLoading(prev => ({ ...prev, [id]: val }));
  }

  async function handleApprove(loan: Loan) {
    setLoading1(loan.id + '_approve', true);
    try {
      await approveLoan(loan.id);
      message.success('Loan approved');
      fetchLoans();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to approve';
      message.error(msg);
    } finally {
      setLoading1(loan.id + '_approve', false);
    }
  }

  function openReject(loan: Loan) {
    rejectForm.resetFields();
    setRejectingId(loan.id);
    setRejectOpen(true);
  }

  async function handleReject() {
    if (!rejectingId) return;
    setRejecting(true);
    try {
      const { reason } = rejectForm.getFieldsValue();
      await rejectLoan(rejectingId, reason);
      message.success('Loan rejected');
      setRejectOpen(false);
      fetchLoans();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to reject';
      message.error(msg);
    } finally {
      setRejecting(false);
    }
  }

  async function handleCheckout(loan: Loan) {
    setLoading1(loan.id + '_checkout', true);
    try {
      await checkoutLoan(loan.id);
      message.success('Receipt confirmed — loan is now checked out');
      fetchLoans();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to confirm receipt';
      message.error(msg);
    } finally {
      setLoading1(loan.id + '_checkout', false);
    }
  }

  async function handleInitiateReturn(loan: Loan) {
    setLoading1(loan.id + '_initiate', true);
    try {
      await initiateReturn(loan.id);
      message.success('Return initiated — awaiting manager confirmation');
      fetchLoans();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to initiate return';
      message.error(msg);
    } finally {
      setLoading1(loan.id + '_initiate', false);
    }
  }

  function openReturn(loan: Loan) {
    returnForm.resetFields();
    returnForm.setFieldsValue({ returned_quantity: loan.quantity, condition: 'good' });
    setReturningLoan(loan);
    setReturnOpen(true);
  }

  async function handleConfirmReturn() {
    if (!returningLoan) return;
    setConfirming(true);
    try {
      const values = returnForm.getFieldsValue();
      await confirmReturn(returningLoan.id, {
        condition: values.condition as ReturnCondition,
        returned_quantity: Number(values.returned_quantity),
        notes: values.notes,
      });
      message.success('Return confirmed');
      setReturnOpen(false);
      fetchLoans();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to confirm return';
      message.error(msg);
    } finally {
      setConfirming(false);
    }
  }

  function openCreate() {
    createForm.resetFields();
    setCreateOpen(true);
  }

  async function handleCreate(values: Record<string, unknown>) {
    setCreating(true);
    try {
      await createLoan({
        asset_id: values.asset_id as string,
        quantity: Number(values.quantity),
        due_date: (values.due_date as dayjs.Dayjs).format('YYYY-MM-DD'),
        reason: values.reason as string | undefined,
        coach_id: values.coach_id as string | undefined,
      });
      message.success('Loan request submitted');
      setCreateOpen(false);
      fetchLoans();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to create loan';
      message.error(msg);
    } finally {
      setCreating(false);
    }
  }

  function openEdit(loan: Loan) {
    editForm.resetFields();
    editForm.setFieldsValue({
      asset_id:  loan.asset_id,
      quantity:  loan.quantity,
      due_date:  dayjs(loan.due_date),
      reason:    loan.reason ?? undefined,
      coach_id:  loan.coach_id,
    });
    setEditingLoan(loan);
    setEditOpen(true);
  }

  async function handleEdit(values: Record<string, unknown>) {
    if (!editingLoan) return;
    setEditing(true);
    try {
      await updateLoan(editingLoan.id, {
        asset_id:  values.asset_id as string,
        quantity:  Number(values.quantity),
        due_date:  (values.due_date as dayjs.Dayjs).format('YYYY-MM-DD'),
        reason:    values.reason as string | undefined,
        coach_id:  values.coach_id as string | undefined,
      });
      message.success('Loan updated');
      setEditOpen(false);
      fetchLoans();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to update loan';
      message.error(msg);
    } finally {
      setEditing(false);
    }
  }

  const columns: ColumnsType<Loan> = [
    {
      title: 'Asset',
      key: 'asset',
      render: (_: unknown, loan: Loan) => (
        <Flex align="center" gap={10}>
          {loan.asset_image ? (
            <Avatar shape="square" size={36} src={loan.asset_image} />
          ) : (
            <Avatar shape="square" size={36} icon={<PictureOutlined />}
              style={{ background: '#f0f0f0', color: '#bfbfbf' }} />
          )}
          <div>
            <Text strong style={{ display: 'block' }}>{loan.asset_name}</Text>
            <Text style={{ fontSize: 12, color: '#8c8c8c' }}>×{loan.quantity}</Text>
          </div>
        </Flex>
      ),
    },
    {
      title: 'Borrower',
      key: 'borrower',
      render: (_: unknown, loan: Loan) => (
        <Text>{loan.coach_name}</Text>
      ),
    },
    {
      title: 'Due Date',
      key: 'due_date',
      responsive: ['sm'] as ('sm')[],
      render: (_: unknown, loan: Loan) => (
        <Text style={{ color: loan.status === 'checked_out' && dayjs(loan.due_date).isBefore(dayjs()) ? '#ff4d4f' : undefined }}>
          {dayjs(loan.due_date).format('MMM D, YYYY')}
        </Text>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: LoanStatus) => (
        <Tag color={STATUS_COLOR[status]}>{STATUS_LABEL[status]}</Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_: unknown, loan: Loan) => {
        const buttons: React.ReactNode[] = [];

        // Edit: manager can edit any pending loan; coach can edit pending loans where they are the borrower
        const canEdit = loan.status === 'pending' && (
          isManager || (isCoach && loan.coach_id === user?.id)
        );
        if (canEdit) {
          buttons.push(
            <Button
              key="edit" size="small" icon={<EditOutlined />}
              onClick={() => openEdit(loan)}
            >Edit</Button>,
          );
        }

        if (loan.status === 'pending' && isManager) {
          buttons.push(
            <Button
              key="approve" size="small" type="primary" icon={<CheckOutlined />}
              loading={actionLoading[loan.id + '_approve']}
              onClick={() => handleApprove(loan)}
            >Approve</Button>,
            <Button
              key="reject" size="small" danger icon={<CloseOutlined />}
              onClick={() => openReject(loan)}
            >Reject</Button>,
          );
        }

        if (loan.status === 'approved' && (isCoach ? loan.coach_id === user?.id : false)) {
          buttons.push(
            <Button
              key="checkout" size="small" type="primary" icon={<CheckOutlined />}
              loading={actionLoading[loan.id + '_checkout']}
              onClick={() => handleCheckout(loan)}
            >Confirm Receipt</Button>,
          );
        }

        if (loan.status === 'checked_out' && isCoach && loan.coach_id === user?.id) {
          buttons.push(
            <Popconfirm
              key="initiate"
              title="Initiate Return"
              description="Confirm you are returning these items?"
              onConfirm={() => handleInitiateReturn(loan)}
              okText="Yes, return"
            >
              <Button
                size="small" icon={<SendOutlined />}
                loading={actionLoading[loan.id + '_initiate']}
              >Return</Button>
            </Popconfirm>,
          );
        }

        if (loan.status === 'checked_out' && isManager) {
          buttons.push(
            <Button
              key="confirm-return" size="small" type="primary" icon={<ArrowDownOutlined />}
              onClick={() => openReturn(loan)}
            >Confirm Return</Button>,
          );
        }

        return <Space size={4} wrap>{buttons}</Space>;
      },
    },
  ];

  const tabItems = STATUS_TABS.map(t => ({ key: t.key, label: t.label }));

  return (
    <div>
      <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Loans</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          New Loan Request
        </Button>
      </Flex>

      <Tabs
        activeKey={activeTab}
        items={tabItems}
        onChange={handleTabChange}
        style={{ marginBottom: 8 }}
      />

      <Table
        dataSource={loans}
        columns={columns}
        rowKey="id"
        loading={loading}
        scroll={{ x: 600 }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showTotal: t => `${t} loans`,
          onChange: p => { setPage(p); fetchLoans(p); },
        }}
      />

      {/* Create Loan Modal */}
      <Modal
        open={createOpen}
        title="New Loan Request"
        onCancel={() => setCreateOpen(false)}
        footer={null}
        width={520}
        destroyOnClose
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreate}
          style={{ marginTop: 16 }}
          initialValues={{ quantity: 1 }}
        >
          <Form.Item
            name="asset_id" label="Asset"
            rules={[{ required: true, message: 'Please select an asset' }]}
          >
            <Select
              showSearch
              placeholder="Select asset"
              filterOption={(input, option) =>
                String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={assets.map(a => ({
                value: a.id,
                label: `${a.name}${a.size ? ` (${a.size})` : ''} — ${a.available_quantity} available`,
              }))}
            />
          </Form.Item>

          {isManager && (
            <Form.Item
              name="coach_id" label="Borrower (Coach)"
              rules={[{ required: true, message: 'Please select a coach' }]}
            >
              <Select
                showSearch
                placeholder="Select coach"
                filterOption={(input, option) =>
                  String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
                options={coaches.map(c => ({ value: c.id, label: c.name }))}
              />
            </Form.Item>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="quantity" label="Quantity"
                rules={[{ required: true }]}
              >
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="due_date" label="Due Date"
                rules={[{ required: true, message: 'Please select a due date' }]}
              >
                <DatePicker
                  style={{ width: '100%' }}
                  disabledDate={d => d.isBefore(dayjs(), 'day')}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="reason" label="Reason (optional)">
            <TextArea rows={2} placeholder="e.g. Training session on Saturday" />
          </Form.Item>

          <Flex gap={8} justify="flex-end">
            <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={creating}>Submit Request</Button>
          </Flex>
        </Form>
      </Modal>

      {/* Edit Loan Modal */}
      <Modal
        open={editOpen}
        title="Edit Loan Request"
        onCancel={() => setEditOpen(false)}
        footer={null}
        width={520}
        destroyOnClose
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={handleEdit}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="asset_id" label="Asset"
            rules={[{ required: true, message: 'Please select an asset' }]}
          >
            <Select
              showSearch
              placeholder="Select asset"
              filterOption={(input, option) =>
                String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={assets.map(a => ({
                value: a.id,
                label: `${a.name}${a.size ? ` (${a.size})` : ''} — ${a.available_quantity} available`,
              }))}
            />
          </Form.Item>

          {isManager && (
            <Form.Item
              name="coach_id" label="Borrower (Coach)"
              rules={[{ required: true, message: 'Please select a coach' }]}
            >
              <Select
                showSearch
                placeholder="Select coach"
                filterOption={(input, option) =>
                  String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
                options={coaches.map(c => ({ value: c.id, label: c.name }))}
              />
            </Form.Item>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="quantity" label="Quantity"
                rules={[{ required: true }]}
              >
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="due_date" label="Due Date"
                rules={[{ required: true, message: 'Please select a due date' }]}
              >
                <DatePicker
                  style={{ width: '100%' }}
                  disabledDate={d => d.isBefore(dayjs(), 'day')}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="reason" label="Reason (optional)">
            <TextArea rows={2} />
          </Form.Item>

          <Flex gap={8} justify="flex-end">
            <Button onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={editing}>Save Changes</Button>
          </Flex>
        </Form>
      </Modal>

      {/* Reject Modal */}
      <Modal
        open={rejectOpen}
        title="Reject Loan Request"
        onCancel={() => setRejectOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={rejectForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="reason" label="Reason (optional)">
            <TextArea rows={3} placeholder="Explain why this request is being rejected…" />
          </Form.Item>
          <Flex gap={8} justify="flex-end">
            <Button onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button danger loading={rejecting} onClick={handleReject}>Reject</Button>
          </Flex>
        </Form>
      </Modal>

      {/* Confirm Return Modal */}
      <Modal
        open={returnOpen}
        title="Confirm Return"
        onCancel={() => setReturnOpen(false)}
        footer={null}
        destroyOnClose
      >
        {returningLoan && (
          <Form form={returnForm} layout="vertical" style={{ marginTop: 16 }}>
            <Form.Item label="Loan">
              <Text>{returningLoan.asset_name} ×{returningLoan.quantity} — borrowed by {returningLoan.coach_name}</Text>
            </Form.Item>

            <Form.Item
              name="returned_quantity" label="Returned Quantity"
              rules={[{ required: true }]}
            >
              <InputNumber min={1} max={returningLoan.quantity} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              name="condition" label="Condition"
              rules={[{ required: true, message: 'Please select condition' }]}
            >
              <Radio.Group>
                {CONDITION_OPTIONS.map(o => (
                  <Radio key={o.value} value={o.value}>{o.label}</Radio>
                ))}
              </Radio.Group>
            </Form.Item>

            <Form.Item name="notes" label="Notes (optional)">
              <TextArea rows={2} placeholder="Any damage details or observations…" />
            </Form.Item>

            <Flex gap={8} justify="flex-end">
              <Button onClick={() => setReturnOpen(false)}>Cancel</Button>
              <Button type="primary" loading={confirming} onClick={handleConfirmReturn}>Confirm Return</Button>
            </Flex>
          </Form>
        )}
      </Modal>
    </div>
  );
}
