import client from './client';

// ─── Types ────────────────────────────────────────────────────────────────

export interface CategoryBreakdown {
  category_name: string;
  total_qty: number;
  available_qty: number;
}

export interface SummaryReport {
  total_assets: number;
  total_items: number;
  available_items: number;
  total_purchase_value: number;
  active_total: number;
  available_qty: number;
  on_loan_qty: number;
  maintenance_qty: number;
  retired_qty: number;
  active_loans: number;
  overdue_loans: number;
  category_breakdown: CategoryBreakdown[];
}

export interface DepreciationItem {
  batch_id: string;
  asset_name: string;
  brand: string | null;
  model: string | null;
  purchase_date: string;
  purchase_price: number;
  total_quantity: number;
  years_elapsed: number;
  annual_depreciation: number;
  accumulated_depreciation: number;
  net_book_value: number;
}

export interface DepreciationReport {
  items: DepreciationItem[];
  summary: {
    total_batches_with_depreciation: number;
    total_purchase_value: string;
    total_net_book_value: string;
    total_accumulated_depreciation: string;
  };
}

export interface RetirementRiskItem {
  batch_id: string;
  asset_name: string;
  brand: string | null;
  model: string | null;
  size: string | null;
  purchase_date: string;
  useful_life_years: number;
  total_quantity: number;
  batch_status: string;
  life_used_percent: number;
}

export interface LowStockItem {
  asset_type_id: string;
  asset_name: string;
  brand: string | null;
  model: string | null;
  size: string | null;
  total_qty: number;
  available_qty: number;
  effective_threshold: number;
}

export interface AlertsReport {
  retirement_risk: RetirementRiskItem[];
  low_stock: LowStockItem[];
  total_alert_count: number;
}

export interface TopAsset {
  id: string;
  name: string;
  loan_count: number;
  total_quantity_borrowed: number;
}

export interface CoachSummary {
  id: string;
  name: string;
  loan_count: number;
  active_loans: number;
}

export interface MonthlyTrend {
  month: string;
  loan_count: number;
}

export interface TeamSummary {
  id: string | null;
  name: string;
  age_group?: string;
  gender?: string;
  total_loans: number;
  active_loans: number;
  overdue_loans: number;
}

export interface LoanUsageReport {
  top_assets: TopAsset[];
  coach_summary: CoachSummary[];
  monthly_trend: MonthlyTrend[];
  team_summary: TeamSummary;
}

export interface MovementSummary {
  type: string;
  count: number;
  total_units: number;
}

export interface RecentMovement {
  id: string;
  asset_type_name: string;
  type: string;
  quantity_delta: number;
  created_at: string;
}

// ─── API functions ─────────────────────────────────────────────────────────

export function getSummary(): Promise<SummaryReport> {
  return client.get<SummaryReport>('/reports/summary').then(r => r.data);
}

export function getDepreciation(): Promise<DepreciationReport> {
  return client
    .get<{
      items: Record<string, unknown>[];
      summary: DepreciationReport['summary'];
    }>('/reports/depreciation')
    .then(r => ({
      summary: r.data.summary,
      items: r.data.items.map(x => ({
        batch_id:                 String(x.batch_id),
        asset_name:               String(x.asset_name),
        brand:                    x.brand != null ? String(x.brand) : null,
        model:                    x.model != null ? String(x.model) : null,
        purchase_date:            String(x.purchase_date),
        purchase_price:           Number(x.purchase_price),
        total_quantity:           Number(x.total_quantity),
        years_elapsed:            Number(x.years_elapsed),
        annual_depreciation:      Number(x.annual_depreciation),
        accumulated_depreciation: Number(x.accumulated_depreciation),
        net_book_value:           Number(x.net_book_value),
      })),
    }));
}

// Coercion is handled server-side; raw pg rows are mapped before the JSON response.
export function getAlerts(): Promise<AlertsReport> {
  return client.get<AlertsReport>('/reports/alerts').then(r => r.data);
}

// getLoanUsage coerces pg aggregate strings (COUNT/SUM) to numbers
export function getLoanUsage(params?: { team_id?: string }): Promise<LoanUsageReport> {
  return client
    .get<{
      top_assets: Record<string, unknown>[];
      coach_summary: Record<string, unknown>[];
      monthly_trend: Record<string, unknown>[];
      team_summary: Record<string, unknown> | null;
    }>('/reports/loan-usage', { params })
    .then(r => ({
      top_assets: r.data.top_assets.map(x => ({
        id: String(x.id),
        name: String(x.name),
        loan_count: Number(x.loan_count),
        total_quantity_borrowed: Number(x.total_quantity_borrowed),
      })),
      coach_summary: r.data.coach_summary.map(x => ({
        id: String(x.id),
        name: String(x.name),
        loan_count: Number(x.loan_count),
        active_loans: Number(x.active_loans),
      })),
      monthly_trend: r.data.monthly_trend.map(x => ({
        month: String(x.month),
        loan_count: Number(x.loan_count),
      })),
      team_summary: {
        id:            r.data.team_summary.id != null ? String(r.data.team_summary.id) : null,
        name:          String(r.data.team_summary.name),
        age_group:     r.data.team_summary.age_group != null ? String(r.data.team_summary.age_group) : undefined,
        gender:        r.data.team_summary.gender != null ? String(r.data.team_summary.gender) : undefined,
        total_loans:   Number(r.data.team_summary.total_loans),
        active_loans:  Number(r.data.team_summary.active_loans),
        overdue_loans: Number(r.data.team_summary.overdue_loans),
      },
    }));
}

// getMovements coerces pg aggregate strings to numbers
export function getMovements(): Promise<MovementSummary[]> {
  return client
    .get<Record<string, unknown>[]>('/reports/movements')
    .then(r =>
      r.data.map(x => ({
        type: String(x.type),
        count: Number(x.count),
        total_units: Number(x.total_units),
      }))
    );
}

export function getRecentMovements(): Promise<RecentMovement[]> {
  return client.get<RecentMovement[]>('/reports/movements/recent').then(r => r.data);
}
