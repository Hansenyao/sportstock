export type UserRole = 'super_admin' | 'club_admin' | 'asset_manager' | 'coach';
export type AssetStatus = 'available' | 'on_loan' | 'maintenance' | 'retired';
export type LoanStatus = 'pending' | 'approved' | 'rejected' | 'checked_out' | 'returned';
export type ReturnCondition = 'good' | 'minor_damage' | 'severe_damage';
export type StockMovementType = 'purchase' | 'loan_out' | 'loan_return' | 'write_off' | 'adjustment';
export type NotificationType =
  | 'loan_request' | 'loan_approved' | 'loan_rejected'
  | 'loan_due_reminder' | 'loan_overdue' | 'low_stock' | 'return_initiated';

export interface AuthUser {
  id: string;
  club_id: string | null;
  clerk_id: string;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
