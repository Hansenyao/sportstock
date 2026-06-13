import { useEffect, useState, useCallback } from 'react';
import {
  Table, Button, Tag, Modal, Form, Input, Select, Typography, Flex, App,
  Space, Tabs, DatePicker, Popconfirm, InputNumber, Drawer, Badge,
  Avatar, Card, List, Divider, Empty, Grid, Tooltip, Row, Col,
  Collapse, Spin,
} from 'antd';
import {
  PlusOutlined, PictureOutlined, CheckOutlined, CloseOutlined,
  ArrowDownOutlined, ShoppingCartOutlined, DeleteOutlined, EditOutlined,
  MinusOutlined, DeleteFilled, CheckCircleOutlined, SearchOutlined,
  AppstoreAddOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useAuth } from '../../contexts/AuthContext';
import {
  listLoans, createLoan, updateLoan, deleteLoan, approveLoan, rejectLoan,
  checkoutLoan, confirmReturn,
  type Loan, type LoanStatus, type LoanItem, type CartEntry, type KitCartEntry, type AssetCartEntry, type ReturnItemPayload, type LoanFilters,
} from '../../api/loans';
import { listAssets, type AssetType } from '../../api/assets';
import { listUsers, getUser, type ClubUser } from '../../api/users';
import { listTeams, type Team, type UserTeamMembership } from '../../api/teams';
import * as kitsApi from '../../api/kits';
import type { KitListItem } from '../../api/kits';
import { listWarehouses, type Warehouse } from '../../api/warehouses';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { useBreakpoint } = Grid;

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_TABS = [
  { key: 'all',         label: 'All' },
  { key: 'pending',     label: 'Pending' },
  { key: 'approved',    label: 'Approved' },
  { key: 'checked_out', label: 'Checked Out' },
  { key: 'overdue',     label: 'Overdue' },
  { key: 'returned',    label: 'Returned' },
  { key: 'rejected',    label: 'Rejected' },
] as const;

const STATUS_COLOR: Record<LoanStatus, string> = {
  pending: 'orange', approved: 'blue', rejected: 'red',
  checked_out: 'purple', returned: 'green',
};
const STATUS_LABEL: Record<LoanStatus, string> = {
  pending: 'Pending', approved: 'Approved', rejected: 'Rejected',
  checked_out: 'Checked Out', returned: 'Returned',
};

const DATE_PRESET_OPTIONS = [
  { value: '7d',     label: 'Last 7 days' },
  { value: '30d',    label: 'Last 30 days' },
  { value: '3m',     label: 'Last 3 months' },
  { value: '1y',     label: 'Last year' },
  { value: 'custom', label: 'Custom range…' },
];

const PAGE_SIZE = 20;

// ── Cart helpers ──────────────────────────────────────────────────────────────

function loadCart(userId: string | undefined): CartEntry[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(`cart_${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartEntry[];
    if (parsed.length > 0 && !('type' in parsed[0])) return [];
    return parsed;
  } catch { return []; }
}

function saveCart(userId: string | undefined, items: CartEntry[]) {
  if (!userId) return;
  localStorage.setItem(`cart_${userId}`, JSON.stringify(items));
}

// ── Asset thumbnail ───────────────────────────────────────────────────────────

function AssetThumb({ src, size = 36 }: { src?: string | null; size?: number }) {
  return src
    ? <Avatar shape="square" size={size} src={src} />
    : <Avatar shape="square" size={size} icon={<PictureOutlined />}
        style={{ background: '#f0f0f0', color: '#bfbfbf' }} />;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LoansPage() {
  const { user, activeClub } = useAuth();
  const { message } = App.useApp();
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const [rejectForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const isManager = activeClub?.role === 'club_admin' || activeClub?.role === 'asset_manager';
  const isCoach   = activeClub?.role === 'coach';

  // List state
  const [loans, setLoans]       = useState<Loan[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [expandedRows, setExpandedRows] = useState<string[]>([]);
  const [filters, setFilters]   = useState<LoanFilters>({});
  const [datePreset, setDatePreset] = useState<string>('all');
  const [customDateRange, setCustomDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  // Reference data
  const [assets, setAssets]   = useState<AssetType[]>([]);
  const [coaches, setCoaches] = useState<ClubUser[]>([]);
  const [teams, setTeams]     = useState<Team[]>([]);

  // Teams for the coach being selected in create/edit form
  const [createCoachTeams, setCreateCoachTeams] = useState<UserTeamMembership[]>([]);
  const [createCoachTeamsLoading, setCreateCoachTeamsLoading] = useState(false);
  const [editCoachTeams, setEditCoachTeams] = useState<UserTeamMembership[]>([]);

  // Cart & create drawer state
  const [cart, setCart]             = useState<CartEntry[]>(() => loadCart(user?.id));
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [createForm] = Form.useForm();
  const [creating, setCreating]     = useState(false);

  // Warehouses for approve modal
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  // Action modals
  const [approveOpen, setApproveOpen]     = useState(false);
  const [approvingLoan, setApprovingLoan] = useState<Loan | null>(null);
  const [approveForm] = Form.useForm();
  const [approving, setApproving]         = useState(false);

  const [rejectOpen, setRejectOpen]   = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejecting, setRejecting]     = useState(false);

  const [returnOpen, setReturnOpen]     = useState(false);
  const [returningLoan, setReturningLoan] = useState<Loan | null>(null);
  const [returnItems, setReturnItems]   = useState<ReturnItemPayload[]>([]);
  const [returnNotes, setReturnNotes]   = useState('');
  const [confirming, setConfirming]     = useState(false);

  const [editOpen, setEditOpen]       = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [editCart, setEditCart]       = useState<CartEntry[]>([]);
  const [editing, setEditing]         = useState(false);

  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const setAL = (key: string, val: boolean) =>
    setActionLoading(prev => ({ ...prev, [key]: val }));

  // Kit selector state
  const [kitModalOpen, setKitModalOpen]   = useState(false);
  const [kitModalTarget, setKitModalTarget] = useState<'create' | 'edit'>('create');
  const [kitList, setKitList]             = useState<KitListItem[]>([]);
  const [kitsLoading, setKitsLoading]     = useState(false);

  // ── Data loading ────────────────────────────────────────────────────────────

  const fetchLoans = useCallback(async (p = page, tab = activeTab, f = filters) => {
    setLoading(true);
    try {
      const params: LoanFilters = { page: p, limit: PAGE_SIZE };
      if (tab === 'overdue') {
        params.overdue = true;
      } else if (tab !== 'all') {
        params.status = tab as LoanStatus;
      }
      if (f.team_id)   params.team_id   = f.team_id;
      if (f.coach_id)  params.coach_id  = f.coach_id;
      if (f.search)    params.search    = f.search;
      if (f.from_date) params.from_date = f.from_date;
      if (f.to_date)   params.to_date   = f.to_date;
      const res = await listLoans(params);
      setLoans(res.data.data);
      setTotal(res.data.total);
    } catch { message.error('Failed to load loans'); }
    finally { setLoading(false); }
  }, [page, activeTab, filters, message]);

  function applyFilters(changed: Partial<LoanFilters>) {
    const next = { ...filters, ...changed };
    setFilters(next);
    setPage(1);
    setExpandedRows([]);
    fetchLoans(1, activeTab, next);
  }

  function applyDatePreset(preset: string, custom?: [dayjs.Dayjs, dayjs.Dayjs] | null) {
    setDatePreset(preset);
    const now = dayjs();
    let from_date: string | undefined;
    let to_date: string | undefined;
    if      (preset === '7d')  from_date = now.subtract(7,  'day'  ).startOf('day').toISOString();
    else if (preset === '30d') from_date = now.subtract(30, 'day'  ).startOf('day').toISOString();
    else if (preset === '3m')  from_date = now.subtract(3,  'month').startOf('day').toISOString();
    else if (preset === '1y')  from_date = now.subtract(1,  'year' ).startOf('day').toISOString();
    else if (preset === 'custom' && custom) {
      from_date = custom[0].startOf('day').toISOString();
      to_date   = custom[1].endOf('day').toISOString();
    }
    applyFilters({ from_date, to_date });
  }

  useEffect(() => { fetchLoans(); }, []); // eslint-disable-line

  useEffect(() => {
    listAssets({ limit: 200 }).then(r => setAssets(r.data.data)).catch(() => {});
    if (isManager) {
      listUsers({ role: 'coach', limit: 200 }).then(r => setCoaches(r.data.data)).catch(() => {});
      listTeams().then(r => setTeams(r.data)).catch(() => {});
      listWarehouses().then(r => setWarehouses(r.data.items)).catch(() => {});
    }
    if (isCoach && user?.id) {
      getUser(user.id).then(r => setCreateCoachTeams(r.data.teams ?? [])).catch(() => {});
    }
  }, [isManager, isCoach, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cart operations ─────────────────────────────────────────────────────────

  function cartAdd(asset: AssetType) {
    setCart(prev => {
      if (prev.find(e => e.type === 'asset' && e.asset_type_id === asset.id)) return prev;
      const next: CartEntry[] = [...prev, {
        type: 'asset',
        asset_type_id: asset.id,
        asset_name: asset.name,
        asset_image: asset.image_url ?? null,
        brand: asset.brand ?? null,
        model: asset.model ?? null,
        size: asset.size ?? null,
        available_quantity: asset.available_quantity,
        quantity: 1,
      }];
      saveCart(user?.id, next);
      return next;
    });
  }

  function cartRemove(type: 'kit' | 'asset', id: string) {
    setCart(prev => {
      const next = type === 'kit'
        ? prev.filter(e => !(e.type === 'kit' && e.kit_id === id))
        : prev.filter(e => !(e.type === 'asset' && e.asset_type_id === id));
      saveCart(user?.id, next);
      return next;
    });
  }

  function cartSetQty(type: 'kit' | 'asset', id: string, qty: number) {
    setCart(prev => {
      const next = prev.map(e => {
        if (type === 'asset' && e.type === 'asset' && e.asset_type_id === id)
          return qty < 1 ? null : { ...e, quantity: qty };
        if (type === 'kit' && e.type === 'kit' && e.kit_id === id)
          return qty < 1 ? null : { ...e, kit_quantity: qty };
        return e;
      }).filter((e): e is CartEntry => e !== null);
      saveCart(user?.id, next);
      return next;
    });
  }

  function clearCart() {
    setCart([]);
    saveCart(user?.id, []);
  }

  function expandCartToItems(entries: CartEntry[]) {
    return entries.flatMap(e => {
      if (e.type === 'kit') {
        return e.items.map(i => ({
          asset_type_id: i.asset_type_id,
          quantity: i.per_kit_quantity * e.kit_quantity,
          kit_id: e.kit_id,
          kit_name: e.kit_name,
          kit_quantity: e.kit_quantity,
        }));
      }
      return [{
        asset_type_id: e.asset_type_id,
        quantity: e.quantity,
        kit_id: null as string | null,
        kit_name: null as string | null,
        kit_quantity: null as number | null,
      }];
    });
  }

  // ── Kit selector ─────────────────────────────────────────────────────────────

  async function openKitModal(target: 'create' | 'edit') {
    setKitModalTarget(target);
    setKitModalOpen(true);
    setKitsLoading(true);
    try {
      const res = await kitsApi.listKits();
      setKitList(res.data);
    } catch {
      message.error('Failed to load kits');
    } finally {
      setKitsLoading(false);
    }
  }

  async function handleKitAdd(kitId: string, kitQty: number, target: 'create' | 'edit') {
    try {
      const res = await kitsApi.getKit(kitId);
      const kit = res.data;
      const entry: KitCartEntry = {
        type: 'kit',
        kit_id: kitId,
        kit_name: kit.name,
        kit_quantity: kitQty,
        items: kit.items.map(ki => ({
          asset_type_id: ki.asset_type_id,
          asset_name: ki.asset_type_name,
          asset_image: ki.image_url ?? null,
          brand: null,
          model: null,
          size: null,
          per_kit_quantity: ki.quantity,
          available_quantity: ki.available_quantity,
        })),
      };
      if (target === 'create') {
        setCart(prev => {
          const exists = prev.find(e => e.type === 'kit' && e.kit_id === kitId);
          const next = exists
            ? prev.map(e => e.type === 'kit' && e.kit_id === kitId ? entry : e)
            : [...prev, entry];
          saveCart(user?.id, next);
          return next;
        });
      } else {
        setEditCart(prev => {
          const exists = prev.find(e => e.type === 'kit' && e.kit_id === kitId);
          return exists
            ? prev.map(e => e.type === 'kit' && e.kit_id === kitId ? entry : e)
            : [...prev, entry];
        });
      }
      message.success('Kit added');
    } catch {
      message.error('Failed to load kit');
    }
  }

  // ── Create loan ─────────────────────────────────────────────────────────────

  function openCreate() {
    setCreateStep(1);
    createForm.resetFields();
    // Pre-select team for coaches already in exactly one team
    if (isCoach && createCoachTeams.length === 1) {
      createForm.setFieldValue('team_id', createCoachTeams[0].team_id);
    }
    setCartDrawerOpen(true);
  }

  async function handleCoachSelect(coachId: string) {
    createForm.setFieldValue('team_id', undefined);
    setCreateCoachTeams([]);
    if (!coachId) return;
    setCreateCoachTeamsLoading(true);
    try {
      const res = await getUser(coachId);
      const teams = res.data.teams ?? [];
      setCreateCoachTeams(teams);
      if (teams.length === 1) createForm.setFieldValue('team_id', teams[0].team_id);
    } catch {} finally {
      setCreateCoachTeamsLoading(false);
    }
  }

  async function handleCreate(values: Record<string, unknown>) {
    if (!cart.length) { message.error('Cart is empty'); return; }
    setCreating(true);
    try {
      await createLoan({
        items: expandCartToItems(cart),
        due_date: (values.due_date as dayjs.Dayjs).format('YYYY-MM-DD'),
        reason:   values.reason as string | undefined,
        coach_id: values.coach_id as string | undefined,
        team_id:  values.team_id  as string | undefined,
      });
      message.success('Loan request submitted');
      clearCart();
      setCartDrawerOpen(false);
      fetchLoans();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to create loan';
      message.error(msg);
    } finally { setCreating(false); }
  }

  // ── Approve / Reject ────────────────────────────────────────────────────────

  function handleApprove(loan: Loan) {
    approveForm.resetFields();
    if (warehouses.length === 1) approveForm.setFieldsValue({ warehouse_id: warehouses[0].id });
    setApprovingLoan(loan);
    setApproveOpen(true);
  }

  async function handleApproveConfirm() {
    if (!approvingLoan) return;
    const { warehouse_id } = approveForm.getFieldsValue();
    setApproving(true);
    try {
      await approveLoan(approvingLoan.id, warehouse_id);
      message.success('Loan approved');
      setApproveOpen(false);
      fetchLoans();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to approve');
    } finally { setApproving(false); }
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
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to reject');
    } finally { setRejecting(false); }
  }

  // ── Checkout ────────────────────────────────────────────────────────────────

  async function handleCheckout(loan: Loan) {
    setAL(loan.id + '_checkout', true);
    try {
      await checkoutLoan(loan.id);
      message.success('Receipt confirmed — loan is now checked out');
      fetchLoans();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to confirm receipt');
    } finally { setAL(loan.id + '_checkout', false); }
  }

  // ── Return ──────────────────────────────────────────────────────────────────

  function openReturn(loan: Loan) {
    setReturningLoan(loan);
    setReturnItems(loan.items.map(item => ({
      loan_item_id: item.id,
      good_quantity: item.quantity,
      minor_damage_quantity: 0,
      write_off_quantity: 0,
      lost_quantity: 0,
    })));
    setReturnNotes('');
    setReturnOpen(true);
  }

  function updateReturnItem(itemId: string, field: keyof ReturnItemPayload, value: unknown) {
    setReturnItems(prev => prev.map(ri =>
      ri.loan_item_id === itemId ? { ...ri, [field]: value } : ri
    ));
  }

  function buildReturnNote(ri: ReturnItemPayload): string {
    const parts: string[] = [];
    if (ri.good_quantity > 0)          parts.push(`${ri.good_quantity} good`);
    if (ri.minor_damage_quantity > 0)  parts.push(`${ri.minor_damage_quantity} minor damage`);
    if (ri.write_off_quantity > 0)     parts.push(`${ri.write_off_quantity} written off`);
    if (ri.lost_quantity > 0)          parts.push(`${ri.lost_quantity} lost`);
    return parts.join(', ');
  }

  async function handleConfirmReturn() {
    if (!returningLoan) return;
    setConfirming(true);
    try {
      await confirmReturn(returningLoan.id, { items: returnItems, notes: returnNotes || undefined });
      message.success('Return confirmed');
      setReturnOpen(false);
      fetchLoans();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to confirm return');
    } finally { setConfirming(false); }
  }

  // ── Edit ────────────────────────────────────────────────────────────────────

  async function handleDelete(loan: Loan) {
    setAL(loan.id + '_delete', true);
    try {
      await deleteLoan(loan.id);
      message.success('Loan request deleted');
      fetchLoans();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to delete loan');
    } finally {
      setAL(loan.id + '_delete', false);
    }
  }

  function openEdit(loan: Loan) {
    editForm.resetFields();
    editForm.setFieldsValue({
      due_date: dayjs(loan.due_date),
      reason:   loan.reason ?? undefined,
      coach_id: loan.coach_id,
      team_id:  loan.team_id ?? undefined,
    });
    // Reconstruct CartEntry[] from loan items
    const kitMap = new Map<string, KitCartEntry>();
    const standaloneItems: AssetCartEntry[] = [];

    for (const item of loan.items) {
      if (item.kit_id && item.kit_name && item.kit_quantity) {
        if (!kitMap.has(item.kit_id)) {
          kitMap.set(item.kit_id, {
            type: 'kit',
            kit_id: item.kit_id,
            kit_name: item.kit_name,
            kit_quantity: item.kit_quantity,
            items: [],
          });
        }
        kitMap.get(item.kit_id)!.items.push({
          asset_type_id: item.asset_type_id,
          asset_name: item.asset_name,
          asset_image: item.asset_image ?? null,
          brand: item.brand ?? null,
          model: item.model ?? null,
          size: item.size ?? null,
          per_kit_quantity: item.quantity / item.kit_quantity,
          available_quantity: 9999,
        });
      } else {
        standaloneItems.push({
          type: 'asset',
          asset_type_id: item.asset_type_id,
          asset_name: item.asset_name,
          asset_image: item.asset_image ?? null,
          brand: item.brand ?? null,
          model: item.model ?? null,
          size: item.size ?? null,
          available_quantity: 9999,
          quantity: item.quantity,
        });
      }
    }
    setEditCart([...kitMap.values(), ...standaloneItems]);
    // Load teams for this loan's coach
    if (isCoach) {
      setEditCoachTeams(createCoachTeams);
    } else if (loan.coach_id) {
      getUser(loan.coach_id)
        .then(r => setEditCoachTeams(r.data.teams ?? []))
        .catch(() => setEditCoachTeams([]));
    } else {
      setEditCoachTeams([]);
    }
    setEditingLoan(loan);
    setEditOpen(true);
  }

  function editCartAdd(asset: AssetType) {
    setEditCart(prev => {
      if (prev.find(e => e.type === 'asset' && e.asset_type_id === asset.id)) return prev;
      return [...prev, {
        type: 'asset' as const,
        asset_type_id: asset.id,
        asset_name: asset.name,
        asset_image: asset.image_url ?? null,
        brand: asset.brand ?? null,
        model: asset.model ?? null,
        size: asset.size ?? null,
        available_quantity: 9999,
        quantity: 1,
      }];
    });
  }

  function editCartSetQty(type: 'kit' | 'asset', id: string, qty: number) {
    setEditCart(prev =>
      prev.map(e => {
        if (type === 'asset' && e.type === 'asset' && e.asset_type_id === id)
          return qty < 1 ? null : { ...e, quantity: qty };
        if (type === 'kit' && e.type === 'kit' && e.kit_id === id)
          return qty < 1 ? null : { ...e, kit_quantity: qty };
        return e;
      }).filter((e): e is CartEntry => e !== null)
    );
  }

  function editCartRemove(type: 'kit' | 'asset', id: string) {
    setEditCart(prev =>
      type === 'kit'
        ? prev.filter(e => !(e.type === 'kit' && e.kit_id === id))
        : prev.filter(e => !(e.type === 'asset' && e.asset_type_id === id))
    );
  }

  async function handleEdit(values: Record<string, unknown>) {
    if (!editingLoan) return;
    if (!editCart.length) { message.error('At least one item is required'); return; }
    setEditing(true);
    try {
      await updateLoan(editingLoan.id, {
        items:    expandCartToItems(editCart),
        due_date: (values.due_date as dayjs.Dayjs).format('YYYY-MM-DD'),
        reason:   values.reason as string | undefined,
        coach_id: values.coach_id as string | undefined,
        team_id:  (values.team_id as string | undefined) ?? null,
      });
      message.success('Loan updated');
      setEditOpen(false);
      fetchLoans();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to update loan');
    } finally { setEditing(false); }
  }

  // ── Tab change ───────────────────────────────────────────────────────────────

  function handleTabChange(key: string) {
    setActiveTab(key);
    setPage(1);
    setExpandedRows([]);
    fetchLoans(1, key, filters);
  }

  // ── Expandable row: item list ────────────────────────────────────────────────

  function renderExpandedRow(loan: Loan) {
    return (
      <div style={{ padding: '4px 0 12px 40px' }}>

        {/* Loan-level notes */}
        {loan.warehouse_name && (loan.status === 'approved' || loan.status === 'checked_out') && (
          <div style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 12 }}>
              <Text style={{ fontSize: 12, color: '#8c8c8c' }}>Pick up from: </Text>
              <Text strong style={{ fontSize: 12 }}>{loan.warehouse_name}</Text>
            </Text>
          </div>
        )}

        {(loan.reason || loan.rejection_reason || loan.return_notes) && (
          <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {loan.reason && (
              <Text style={{ fontSize: 12 }}>
                <Text style={{ fontSize: 12, color: '#8c8c8c' }}>Reason: </Text>
                {loan.reason}
              </Text>
            )}
            {loan.rejection_reason && (
              <Text style={{ fontSize: 12 }}>
                <Text style={{ fontSize: 12, color: '#ff4d4f' }}>Rejected: </Text>
                {loan.rejection_reason}
              </Text>
            )}
            {loan.return_notes && (
              <Text style={{ fontSize: 12 }}>
                <Text style={{ fontSize: 12, color: '#8c8c8c' }}>Return note: </Text>
                {loan.return_notes}
              </Text>
            )}
          </div>
        )}

        {/* Asset items */}
        <List
          size="small"
          dataSource={loan.items}
          renderItem={(item: LoanItem) => (
            <List.Item style={{ padding: '6px 0', border: 'none' }}>
              <Flex align="center" gap={10} style={{ width: '100%' }}>
                <AssetThumb src={item.asset_image} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text strong style={{ display: 'block', fontSize: 13 }}>{item.asset_name}</Text>
                  <Text style={{ fontSize: 12, color: '#8c8c8c' }}>
                    {[item.brand, item.model, item.size && `Size: ${item.size}`]
                      .filter(Boolean).join(' · ')}
                  </Text>
                  {item.return_notes && (
                    <Text style={{ fontSize: 11, color: '#8c8c8c', display: 'block' }}>
                      Note: {item.return_notes}
                    </Text>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <Text strong>×{item.quantity}</Text>
                  {item.good_quantity != null && (
                    <div style={{ fontSize: 11, lineHeight: 1.4 }}>
                      {item.good_quantity > 0 && (
                        <Text style={{ color: '#52c41a', display: 'block' }}>{item.good_quantity} good</Text>
                      )}
                      {(item.minor_damage_quantity ?? 0) > 0 && (
                        <Text style={{ color: '#faad14', display: 'block' }}>{item.minor_damage_quantity} minor dmg</Text>
                      )}
                      {(item.write_off_quantity ?? 0) > 0 && (
                        <Text style={{ color: '#ff7a45', display: 'block' }}>{item.write_off_quantity} written off</Text>
                      )}
                      {(item.lost_quantity ?? 0) > 0 && (
                        <Text style={{ color: '#ff4d4f', display: 'block' }}>{item.lost_quantity} lost</Text>
                      )}
                    </div>
                  )}
                </div>
              </Flex>
            </List.Item>
          )}
        />
      </div>
    );
  }

  // ── Table columns ────────────────────────────────────────────────────────────

  const columns: ColumnsType<Loan> = [
    {
      title: 'Loan',
      key: 'loan',
      render: (_: unknown, loan: Loan) => {
        const first = loan.items[0];
        const extra = loan.items.length - 1;
        const createdByOther = !isMobile && loan.created_by_name && loan.created_by_name !== loan.coach_name;
        return (
          <Flex align="center" gap={8}>
            <AssetThumb src={first?.asset_image} size={isMobile ? 32 : 40} />
            <div style={{ minWidth: 0, flex: 1 }}>
              {/* Asset name + item count on one line, truncated */}
              <Flex align="baseline" gap={4} style={{ overflow: 'hidden' }}>
                <Text strong style={{
                  fontSize: isMobile ? 13 : 14,
                  overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                  flex: 1, minWidth: 0,
                }}>
                  {first?.asset_name ?? '—'}
                </Text>
                {extra > 0 && (
                  <Text style={{ fontSize: 11, color: '#8c8c8c', flexShrink: 0 }}>
                    +{extra}
                  </Text>
                )}
              </Flex>
              {/* Coach name — no "Borrower:" prefix on mobile */}
              <Text style={{
                fontSize: 12, color: '#8c8c8c',
                display: 'block', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
              }}>
                {isMobile ? loan.coach_name : `Borrower: ${loan.coach_name}`}
              </Text>
              {loan.team_name && (
                <Tag style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', marginTop: 2 }}>
                  {loan.team_name}
                </Tag>
              )}
              {createdByOther && (
                <Text style={{ fontSize: 11, color: '#bfbfbf', display: 'block' }}>
                  Created by: {loan.created_by_name}
                </Text>
              )}
              {/* Status tag inline on mobile (Status column is hidden on mobile) */}
              {isMobile && (
                <Tag color={STATUS_COLOR[loan.status]}
                  style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', marginTop: 3 }}>
                  {STATUS_LABEL[loan.status]}
                </Tag>
              )}
            </div>
          </Flex>
        );
      },
    },
    {
      title: 'Dates',
      key: 'dates',
      width: 100,
      responsive: ['sm'] as ('sm')[],
      render: (_: unknown, loan: Loan) => {
        const isOverdue = loan.status === 'checked_out' && dayjs(loan.due_date).isBefore(dayjs());
        return (
          <div>
            <Text style={{ fontSize: 11, color: '#8c8c8c', display: 'block' }}>
              {dayjs(loan.created_at).format('MMM D')}
            </Text>
            {loan.status === 'returned' && loan.returned_at ? (
              <Text style={{ fontSize: 12, color: '#52c41a' }}>
                ↩ {dayjs(loan.returned_at).format('MMM D')}
              </Text>
            ) : (
              <Text style={{ fontSize: 12, color: isOverdue ? '#ff4d4f' : undefined }}>
                Due {dayjs(loan.due_date).format('MMM D')}
              </Text>
            )}
          </div>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      responsive: ['sm'] as ('sm')[],
      render: (status: LoanStatus) => (
        <Tag color={STATUS_COLOR[status]} style={{ fontSize: 11 }}>{STATUS_LABEL[status]}</Tag>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: isMobile ? 96 : 130,
      render: (_: unknown, loan: Loan) => {
        const buttons: React.ReactNode[] = [];

        const isCreator = loan.created_by === user?.id;
        const canEdit = loan.status === 'pending' && (isManager || (isCoach && loan.coach_id === user?.id));

        if (canEdit) {
          buttons.push(
            <Tooltip key="edit" title="Edit">
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(loan)} />
            </Tooltip>
          );
        }

        if (loan.status === 'pending' && isCreator) {
          buttons.push(
            <Popconfirm
              key="delete"
              title="Delete Loan Request"
              description="This cannot be undone."
              onConfirm={() => handleDelete(loan)}
              okText="Delete"
              okButtonProps={{ danger: true }}
            >
              <Tooltip title="Delete">
                <Button size="small" danger icon={<DeleteFilled />} loading={actionLoading[loan.id + '_delete']} />
              </Tooltip>
            </Popconfirm>
          );
        }

        if (loan.status === 'pending' && isManager) {
          buttons.push(
            <Tooltip key="approve" title="Approve">
              <Button size="small" type="primary" icon={<CheckOutlined />}
                loading={actionLoading[loan.id + '_approve']} onClick={() => handleApprove(loan)} />
            </Tooltip>,
            <Tooltip key="reject" title="Reject">
              <Button size="small" danger icon={<CloseOutlined />} onClick={() => openReject(loan)} />
            </Tooltip>,
          );
        }

        if (loan.status === 'approved' && loan.coach_id === user?.id) {
          buttons.push(
            <Tooltip key="checkout" title="Confirm Receipt">
              <Button size="small" type="primary" icon={<CheckCircleOutlined />}
                loading={actionLoading[loan.id + '_checkout']} onClick={() => handleCheckout(loan)} />
            </Tooltip>,
          );
        }

        if (loan.status === 'checked_out' && isManager) {
          buttons.push(
            <Tooltip key="return" title="Confirm Return">
              <Button size="small" type="primary" icon={<ArrowDownOutlined />} onClick={() => openReturn(loan)} />
            </Tooltip>,
          );
        }

        return <Space size={isMobile ? 2 : 4}>{buttons}</Space>;
      },
    },
  ];

  // ── Cart drawer content ──────────────────────────────────────────────────────

  const assetOptions = assets.map(a => ({
    value: a.id,
    label: `${a.name}${a.size ? ` (${a.size})` : ''} — ${a.available_quantity} avail.`,
    disabled: a.available_quantity === 0,
    _asset: a,
  }));

  const renderCartItems = (cartItems: CartItem[], setQty: (id: string, q: number) => void, remove: (id: string) => void) => (
    cartItems.length === 0
      ? <Empty description="No items" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '20px 0' }} />
      : <List
          dataSource={cartItems}
          renderItem={item => (
            <List.Item style={{ padding: '8px 0' }}>
              <Flex align="center" gap={8} style={{ width: '100%' }}>
                <AssetThumb src={item.asset_image} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text strong style={{ fontSize: 13, display: 'block' }}>{item.asset_name}</Text>
                  <Text style={{ fontSize: 11, color: '#8c8c8c' }}>
                    {[item.size && `Size: ${item.size}`, item.brand].filter(Boolean).join(' · ')}
                  </Text>
                </div>
                <Flex align="center" gap={4}>
                  <Button size="small" icon={<MinusOutlined />} onClick={() => setQty(item.asset_type_id, item.quantity - 1)} />
                  <InputNumber
                    size="small" min={1} max={item.available_quantity} value={item.quantity}
                    onChange={v => setQty(item.asset_type_id, v ?? 1)}
                    style={{ width: 48 }} controls={false}
                  />
                  <Button size="small" icon={<PlusOutlined />}
                    disabled={item.quantity >= item.available_quantity}
                    onClick={() => setQty(item.asset_type_id, item.quantity + 1)} />
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={() => remove(item.asset_type_id)} />
                </Flex>
              </Flex>
            </List.Item>
          )}
        />
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Loans</Title>
        <Badge count={cart.length} size="small">
          <Button type="primary" icon={<ShoppingCartOutlined />} onClick={openCreate}>
            {!isMobile && 'New Loan'}
          </Button>
        </Badge>
      </Flex>

      {/* Filters */}
      <Row gutter={[12, 8]} style={{ marginBottom: 12 }}>
        <Col xs={24} sm={10} md={7}>
          <Input
            placeholder="Search asset or borrower…"
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            allowClear
            onChange={e => applyFilters({ search: e.target.value || undefined })}
          />
        </Col>
        {isManager && teams.length > 0 && (
          <Col xs={12} sm={7} md={5}>
            <Select
              allowClear
              placeholder="All Teams"
              style={{ width: '100%' }}
              value={filters.team_id}
              options={teams.map(t => ({ value: t.id, label: `${t.name} (${t.age_group} ${t.gender})` }))}
              onChange={val => applyFilters({ team_id: val || undefined })}
            />
          </Col>
        )}
        {isManager && coaches.length > 0 && (
          <Col xs={12} sm={7} md={5}>
            <Select
              allowClear
              placeholder="All Coaches"
              style={{ width: '100%' }}
              value={filters.coach_id}
              options={coaches.map(c => ({ value: c.id, label: c.name }))}
              onChange={val => applyFilters({ coach_id: val || undefined })}
            />
          </Col>
        )}
        <Col xs={24} sm={isManager ? 10 : 14} md={isManager ? 7 : 17}>
          <Select
            allowClear
            placeholder="All Time"
            style={{ width: '100%' }}
            value={datePreset === 'all' ? undefined : datePreset}
            options={DATE_PRESET_OPTIONS}
            onChange={val => applyDatePreset((val as string) || 'all')}
          />
        </Col>
        {datePreset === 'custom' && (
          <Col xs={24} md={16}>
            <DatePicker.RangePicker
              style={{ width: '100%' }}
              value={customDateRange}
              onChange={range => {
                const r = range as [dayjs.Dayjs, dayjs.Dayjs] | null;
                setCustomDateRange(r);
                if (r) applyDatePreset('custom', r);
              }}
            />
          </Col>
        )}
      </Row>

      <Tabs
        activeKey={activeTab}
        items={STATUS_TABS.map(t => ({ key: t.key, label: t.label }))}
        onChange={handleTabChange}
        style={{ marginBottom: 8 }}
        size="small"
      />

      <Table
        dataSource={loans}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        expandable={{
          expandedRowKeys: expandedRows,
          onExpand: (expanded, record) => {
            setExpandedRows(expanded ? [record.id] : []);
          },
          expandedRowRender: renderExpandedRow,
        }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showTotal: t => `${t} loans`,
          simple: isMobile,
          onChange: p => { setPage(p); fetchLoans(p); },
        }}
        scroll={{ x: isMobile ? 280 : 600 }}
      />

      {/* ── Create Loan Drawer ─────────────────────────────────────────────── */}
      <Drawer
        open={cartDrawerOpen}
        onClose={() => { setCartDrawerOpen(false); setCreateStep(1); }}
        title={createStep === 1 ? 'Select Assets' : 'Review & Submit'}
        placement="right"
        width={isMobile ? '100%' : 480}
        extra={
          createStep === 1 && (
            <Badge count={cart.length}>
              <Button icon={<ShoppingCartOutlined />} onClick={() => setCreateStep(2)}>
                Checkout
              </Button>
            </Badge>
          )
        }
      >
        {createStep === 1 ? (
          <div>
            {/* Asset picker */}
            <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Tap an asset to add it to your cart. Items with 0 available cannot be added.
              </Text>
              <Button size="small" icon={<AppstoreAddOutlined />}
                onClick={() => openKitModal('create')}>
                Add from Kit
              </Button>
            </Flex>
            <List
              dataSource={assets}
              renderItem={(asset: AssetType) => {
                const inCart = cart.find(i => i.asset_type_id === asset.id);
                const disabled = asset.available_quantity === 0;
                return (
                  <List.Item
                    style={{ padding: '8px 0', opacity: disabled ? 0.45 : 1 }}
                    actions={[
                      inCart
                        ? <Tag color="blue">×{inCart.quantity}</Tag>
                        : <Button size="small" type="primary" icon={<PlusOutlined />}
                            disabled={disabled} onClick={() => cartAdd(asset)}>
                            Add
                          </Button>
                    ]}
                  >
                    <Flex align="center" gap={10}>
                      <AssetThumb src={asset.image_url} size={40} />
                      <div>
                        <Text strong style={{ fontSize: 13 }}>{asset.name}</Text>
                        <Text style={{ fontSize: 11, color: '#8c8c8c', display: 'block' }}>
                          {[asset.brand, asset.size && `Size: ${asset.size}`].filter(Boolean).join(' · ')}
                          {' '}· {asset.available_quantity} available
                        </Text>
                      </div>
                    </Flex>
                  </List.Item>
                );
              }}
            />
            {cart.length > 0 && (
              <>
                <Divider style={{ margin: '12px 0' }} />
                <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
                  <Text strong>Cart ({cart.length} item{cart.length > 1 ? 's' : ''})</Text>
                  <Button size="small" danger onClick={clearCart}>Clear</Button>
                </Flex>
                {renderCartItems(cart, cartSetQty, cartRemove)}
                <Button type="primary" block style={{ marginTop: 12 }} onClick={() => setCreateStep(2)}>
                  Continue →
                </Button>
              </>
            )}
          </div>
        ) : (
          <div>
            <Card size="small" style={{ marginBottom: 16 }} title="Cart Summary">
              {renderCartItems(cart, cartSetQty, cartRemove)}
            </Card>

            <Form form={createForm} layout="vertical" onFinish={handleCreate}>
              {isManager && (
                <Form.Item name="coach_id" label="Borrower (Coach)"
                  rules={[{ required: true, message: 'Please select a coach' }]}>
                  <Select showSearch placeholder="Select coach"
                    filterOption={(input, option) =>
                      String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                    options={coaches.map(c => ({ value: c.id, label: c.name }))}
                    onChange={handleCoachSelect}
                    loading={createCoachTeamsLoading}
                  />
                </Form.Item>
              )}
              {createCoachTeams.length > 0 && (
                <Form.Item
                  name="team_id"
                  label="Team"
                  rules={createCoachTeams.length > 1 ? [{ required: true, message: 'Please select a team' }] : []}
                >
                  <Select
                    placeholder="Select team"
                    disabled={createCoachTeams.length === 1}
                    options={createCoachTeams.map(t => ({
                      value: t.team_id,
                      label: `${t.team_name} (${t.age_group} · ${t.gender})`,
                    }))}
                  />
                </Form.Item>
              )}
              <Form.Item name="due_date" label="Due Date"
                rules={[{ required: true, message: 'Please select a due date' }]}>
                <DatePicker style={{ width: '100%' }}
                  disabledDate={d => d.isBefore(dayjs(), 'day')} />
              </Form.Item>
              <Form.Item name="reason" label="Reason (optional)">
                <TextArea rows={2} placeholder="e.g. Training session on Saturday" />
              </Form.Item>
              <Flex gap={8}>
                <Button style={{ flex: 1 }} onClick={() => setCreateStep(1)}>← Back</Button>
                <Button type="primary" htmlType="submit" loading={creating} style={{ flex: 1 }}
                  disabled={!cart.length}>
                  Submit Request
                </Button>
              </Flex>
            </Form>
          </div>
        )}
      </Drawer>

      {/* ── Approve Modal ─────────────────────────────────────────────────────── */}
      <Modal open={approveOpen} title="Approve Loan Request" onCancel={() => setApproveOpen(false)}
        footer={null} destroyOnClose width={400}>
        <Form form={approveForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="warehouse_id" label="Issue from Warehouse"
            rules={[{ required: true, message: 'Please select a warehouse' }]}>
            <Select
              placeholder="Select warehouse"
              options={warehouses.map(w => ({ value: w.id, label: w.name }))}
            />
          </Form.Item>
          <Flex gap={8} justify="flex-end">
            <Button onClick={() => setApproveOpen(false)}>Cancel</Button>
            <Button type="primary" icon={<CheckOutlined />} loading={approving} onClick={handleApproveConfirm}>
              Approve
            </Button>
          </Flex>
        </Form>
      </Modal>

      {/* ── Reject Modal ──────────────────────────────────────────────────────── */}
      <Modal open={rejectOpen} title="Reject Loan Request" onCancel={() => setRejectOpen(false)}
        footer={null} destroyOnClose>
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

      {/* ── Confirm Return Modal ──────────────────────────────────────────────── */}
      <Modal open={returnOpen} title="Confirm Return" onCancel={() => setReturnOpen(false)}
        footer={null} width={isMobile ? '95vw' : 580} destroyOnClose>
        {returningLoan && (
          <div style={{ marginTop: 12 }}>
            {returningLoan.items.map((item) => {
              const ri = returnItems.find(r => r.loan_item_id === item.id);
              if (!ri) return null;
              const total = ri.good_quantity + ri.minor_damage_quantity + ri.write_off_quantity + ri.lost_quantity;
              const isValid = total === item.quantity;
              const autoNote = buildReturnNote(ri);
              return (
                <Card key={item.id} size="small" style={{ marginBottom: 12 }}>
                  <Flex align="center" gap={10} style={{ marginBottom: 10 }}>
                    <AssetThumb src={item.asset_image} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text strong>{item.asset_name}</Text>
                      <Text style={{ fontSize: 12, color: '#8c8c8c', display: 'block' }}>
                        {[item.brand, item.size && `Size: ${item.size}`]
                          .filter(Boolean).join(' · ')}
                        {' '}· Loaned: <Text strong>{item.quantity}</Text>
                      </Text>
                    </div>
                  </Flex>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                    <div>
                      <Text style={{ fontSize: 11, color: '#52c41a', display: 'block', marginBottom: 4 }}>Good</Text>
                      <InputNumber
                        min={0} max={item.quantity} value={ri.good_quantity} size="small"
                        style={{ width: '100%' }}
                        onChange={v => updateReturnItem(item.id, 'good_quantity', v ?? 0)}
                      />
                    </div>
                    <div>
                      <Text style={{ fontSize: 11, color: '#faad14', display: 'block', marginBottom: 4 }}>Minor Damage</Text>
                      <InputNumber
                        min={0} max={item.quantity} value={ri.minor_damage_quantity} size="small"
                        style={{ width: '100%' }}
                        onChange={v => updateReturnItem(item.id, 'minor_damage_quantity', v ?? 0)}
                      />
                    </div>
                    <div>
                      <Text style={{ fontSize: 11, color: '#ff7a45', display: 'block', marginBottom: 4 }}>Write-off</Text>
                      <InputNumber
                        min={0} max={item.quantity} value={ri.write_off_quantity} size="small"
                        style={{ width: '100%' }}
                        onChange={v => updateReturnItem(item.id, 'write_off_quantity', v ?? 0)}
                      />
                    </div>
                    <div>
                      <Text style={{ fontSize: 11, color: '#ff4d4f', display: 'block', marginBottom: 4 }}>Lost</Text>
                      <InputNumber
                        min={0} max={item.quantity} value={ri.lost_quantity} size="small"
                        style={{ width: '100%' }}
                        onChange={v => updateReturnItem(item.id, 'lost_quantity', v ?? 0)}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: 8 }}>
                    {isValid ? (
                      <Text style={{ fontSize: 11, color: '#8c8c8c' }}>Summary: {autoNote}</Text>
                    ) : (
                      <Text type="danger" style={{ fontSize: 11 }}>
                        ⚠ Total must equal {item.quantity} (currently {total})
                      </Text>
                    )}
                  </div>

                  <Input.TextArea rows={1} placeholder="Additional notes (optional)" style={{ marginTop: 6 }}
                    value={ri.notes ?? ''} onChange={e => updateReturnItem(item.id, 'notes', e.target.value)} />
                </Card>
              );
            })}

            <Form.Item label="Overall return notes (optional)" style={{ marginBottom: 12 }}>
              <TextArea rows={2} value={returnNotes} onChange={e => setReturnNotes(e.target.value)} />
            </Form.Item>
            <Flex gap={8} justify="flex-end">
              <Button onClick={() => setReturnOpen(false)}>Cancel</Button>
              <Popconfirm
                title="Confirm Return"
                description="This action cannot be undone. Write-offs and lost items will be recorded immediately."
                onConfirm={handleConfirmReturn}
                okText="Confirm"
                disabled={returnItems.some(ri => {
                  const item = returningLoan.items.find(i => i.id === ri.loan_item_id);
                  return item && (ri.good_quantity + ri.minor_damage_quantity + ri.write_off_quantity + ri.lost_quantity) !== item.quantity;
                })}
              >
                <Button
                  type="primary" loading={confirming}
                  disabled={returnItems.some(ri => {
                    const item = returningLoan.items.find(i => i.id === ri.loan_item_id);
                    return item && (ri.good_quantity + ri.minor_damage_quantity + ri.write_off_quantity + ri.lost_quantity) !== item.quantity;
                  })}
                >
                  Confirm Return
                </Button>
              </Popconfirm>
            </Flex>
          </div>
        )}
      </Modal>

      {/* ── Edit Loan Drawer ──────────────────────────────────────────────────── */}
      <Drawer open={editOpen} onClose={() => setEditOpen(false)} title="Edit Loan"
        placement="right" width={isMobile ? '100%' : 480} destroyOnClose>
        {editingLoan && (
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
              Add assets from the list below, or adjust quantities.
            </Text>

            {/* Add asset picker */}
            <Flex gap={8} style={{ marginBottom: 12 }}>
              <Select
                showSearch
                placeholder="Add another asset…"
                style={{ flex: 1 }}
                filterOption={(input, option) =>
                  String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                options={assetOptions.filter(o => !editCart.find(i => i.asset_type_id === o.value))}
                onSelect={(_val, option: typeof assetOptions[0]) => editCartAdd(option._asset)}
                value={null}
              />
              <Button icon={<AppstoreAddOutlined />} onClick={() => openKitModal('edit')}>
                Kit
              </Button>
            </Flex>

            {renderCartItems(editCart, editCartSetQty, id => setEditCart(prev => prev.filter(i => i.asset_type_id !== id)))}

            <Divider style={{ margin: '12px 0' }} />

            <Form form={editForm} layout="vertical" onFinish={handleEdit}>
              {isManager && (
                <Form.Item name="coach_id" label="Borrower"
                  rules={[{ required: true }]}>
                  <Select showSearch
                    filterOption={(input, option) =>
                      String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                    options={coaches.map(c => ({ value: c.id, label: c.name }))}
                  />
                </Form.Item>
              )}
              {editCoachTeams.length > 0 && (
                <Form.Item
                  name="team_id"
                  label="Team"
                  rules={editCoachTeams.length > 1 ? [{ required: true, message: 'Please select a team' }] : []}
                >
                  <Select
                    placeholder="Select team"
                    disabled={editCoachTeams.length === 1}
                    options={editCoachTeams.map(t => ({
                      value: t.team_id,
                      label: `${t.team_name} (${t.age_group} · ${t.gender})`,
                    }))}
                  />
                </Form.Item>
              )}
              <Form.Item name="due_date" label="Due Date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }}
                  disabledDate={d => d.isBefore(dayjs(), 'day')} />
              </Form.Item>
              <Form.Item name="reason" label="Reason (optional)">
                <TextArea rows={2} />
              </Form.Item>
              <Flex gap={8}>
                <Button style={{ flex: 1 }} onClick={() => setEditOpen(false)}>Cancel</Button>
                <Button type="primary" htmlType="submit" loading={editing} style={{ flex: 1 }}>
                  Save Changes
                </Button>
              </Flex>
            </Form>
          </div>
        )}
      </Drawer>

      {/* ── Kit Selector Modal ────────────────────────────────────────────────── */}
      <Modal
        open={kitModalOpen}
        title="Add from Kit"
        onCancel={() => setKitModalOpen(false)}
        footer={null}
        destroyOnClose
        width={480}
      >
        {kitsLoading ? (
          <Flex justify="center" style={{ padding: 40 }}>
            <span>Loading kits…</span>
          </Flex>
        ) : kitList.length === 0 ? (
          <Empty description="No kits available" image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ margin: '24px 0' }} />
        ) : (
          <List
            dataSource={kitList}
            style={{ marginTop: 8 }}
            renderItem={(kit: KitListItem) => {
              const disabled = !kit.is_active;
              return (
                <List.Item
                  style={{ opacity: disabled ? 0.45 : 1 }}
                  actions={[
                    disabled ? (
                      <Tooltip title="Kit is inactive" key="disabled">
                        <Button size="small" disabled>Select</Button>
                      </Tooltip>
                    ) : (
                      <Button
                        key="select"
                        size="small"
                        type="primary"
                        onClick={() => handleKitAdd(kit.id, 1, kitModalTarget)}
                      >
                        Select
                      </Button>
                    ),
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Flex align="center" gap={8}>
                        <span>{kit.name}</span>
                        {!kit.is_active && (
                          <Tag color="default" style={{ fontSize: 11 }}>Inactive</Tag>
                        )}
                      </Flex>
                    }
                    description={kit.description ?? undefined}
                  />
                </List.Item>
              );
            }}
          />
        )}
      </Modal>
    </div>
  );
}
