import * as db from '../db';
import * as notificationService from './notification.service';
import AppError from '../utils/AppError';
import type { PaginatedResult } from '../types';

export async function listLoans(
  clubId: string,
  userId: string,
  role: string,
  { status, coach_id, asset_id, from_date, to_date, page = 1, limit = 20 }: {
    status?: string;
    coach_id?: string;
    asset_id?: string;
    from_date?: string;
    to_date?: string;
    page?: number | string;
    limit?: number | string;
  }
): Promise<PaginatedResult<Record<string, unknown>>> {
  const offset = (Number(page) - 1) * Number(limit);
  const conditions = ['l.club_id = $1'];
  const params: unknown[] = [clubId];

  if (role === 'coach') {
    conditions.push(`l.coach_id = $${params.push(userId)}`);
  } else if (coach_id) {
    conditions.push(`l.coach_id = $${params.push(coach_id)}`);
  }

  if (status)    conditions.push(`l.status = $${params.push(status)}`);
  if (asset_id)  conditions.push(`l.asset_id = $${params.push(asset_id)}`);
  if (from_date) conditions.push(`l.created_at >= $${params.push(from_date)}`);
  if (to_date)   conditions.push(`l.created_at < $${params.push(to_date)}`);

  const where = conditions.join(' AND ');
  const [{ rows }, { rows: countRows }] = await Promise.all([
    db.query<Record<string, unknown>>(
      `SELECT l.*,
              a.name AS asset_name, a.image_url AS asset_image,
              u.name AS coach_name,
              ap.name AS approved_by_name
       FROM loans l
       JOIN assets a ON a.id = l.asset_id
       JOIN users  u ON u.id = l.coach_id
       LEFT JOIN users ap ON ap.id = l.approved_by
       WHERE ${where} ORDER BY l.created_at DESC
       LIMIT $${params.push(Number(limit))} OFFSET $${params.push(offset)}`,
      params
    ),
    db.query<{ count: string }>(`SELECT COUNT(*) FROM loans l WHERE ${where}`, params.slice(0, -2)),
  ]);
  return { data: rows, total: parseInt(countRows[0].count), page: Number(page), limit: Number(limit) };
}

export async function createLoan(
  clubId: string,
  coachId: string,
  coachName: string,
  { asset_id, quantity = 1, reason, due_date }: {
    asset_id?: string;
    quantity?: number | string;
    reason?: string;
    due_date?: string;
  }
): Promise<Record<string, unknown>> {
  if (!asset_id || !due_date) throw new AppError('asset_id and due_date are required', 400);
  if (new Date(due_date) <= new Date()) throw new AppError('due_date must be a future date', 400);

  const { rows: assetRows } = await db.query<Record<string, unknown>>(
    'SELECT * FROM assets WHERE id = $1 AND club_id = $2 AND is_active = true',
    [asset_id, clubId]
  );
  if (!assetRows.length) throw new AppError('Asset not found', 404);
  const asset = assetRows[0];

  if (asset.status !== 'available') throw new AppError('Asset is not currently available', 409);
  if (Number(asset.available_quantity) < Number(quantity)) throw new AppError('Insufficient available quantity', 409);

  const { rows } = await db.query<Record<string, unknown>>(
    `INSERT INTO loans (club_id, asset_id, coach_id, quantity, reason, status, due_date)
     VALUES ($1,$2,$3,$4,$5,'pending',$6) RETURNING *`,
    [clubId, asset_id, coachId, Number(quantity), reason ?? null, due_date]
  );
  const loan = rows[0];

  await notificationService.notifyClubRoles(
    clubId, ['asset_manager', 'club_admin'], 'loan_request',
    'New Loan Request',
    `${coachName} is requesting ${quantity}x "${String(asset.name)}"`,
    { loan_id: loan.id, asset_id, coach_id: coachId }
  );

  return loan;
}

export async function getLoan(
  loanId: string,
  clubId: string,
  userId: string,
  role: string
): Promise<Record<string, unknown>> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT l.*,
            a.name AS asset_name, a.image_url AS asset_image,
            u.name AS coach_name, u.email AS coach_email,
            ap.name AS approved_by_name,
            co.name AS checkout_by_name,
            rc.name AS return_confirmed_by_name
     FROM loans l
     JOIN  assets a  ON a.id  = l.asset_id
     JOIN  users  u  ON u.id  = l.coach_id
     LEFT JOIN users ap ON ap.id = l.approved_by
     LEFT JOIN users co ON co.id = l.checkout_by
     LEFT JOIN users rc ON rc.id = l.return_confirmed_by
     WHERE l.id = $1 AND l.club_id = $2`,
    [loanId, clubId]
  );
  if (!rows.length) throw new AppError('Loan not found', 404);
  const loan = rows[0];
  if (role === 'coach' && loan.coach_id !== userId) throw new AppError('Access denied', 403);
  return loan;
}

export async function approveLoan(loanId: string, approverId: string, clubId: string): Promise<Record<string, unknown>> {
  try {
    await db.query('CALL approve_loan($1, $2)', [loanId, approverId]);
  } catch (err) {
    const anyErr = err as { message?: string };
    if (anyErr.message?.includes('not in pending status')) throw new AppError(anyErr.message, 409);
    throw err;
  }
  const { rows } = await db.query<Record<string, unknown>>('SELECT * FROM loans WHERE id = $1', [loanId]);
  const loan = rows[0];
  await notificationService.notifyUser(
    clubId, String(loan.coach_id), 'loan_approved',
    'Loan Request Approved', 'Your loan request has been approved.',
    { loan_id: loan.id }
  );
  return loan;
}

export async function rejectLoan(
  loanId: string,
  approverId: string,
  clubId: string,
  reason?: string
): Promise<Record<string, unknown>> {
  try {
    await db.query('CALL reject_loan($1, $2, $3)', [loanId, approverId, reason ?? null]);
  } catch (err) {
    const anyErr = err as { message?: string };
    if (anyErr.message?.includes('not in pending status')) throw new AppError(anyErr.message, 409);
    throw err;
  }
  const { rows } = await db.query<Record<string, unknown>>('SELECT * FROM loans WHERE id = $1', [loanId]);
  const loan = rows[0];
  const body = reason ? `Your loan request was rejected: ${reason}` : 'Your loan request was rejected.';
  await notificationService.notifyUser(
    clubId, String(loan.coach_id), 'loan_rejected', 'Loan Request Rejected', body, { loan_id: loan.id }
  );
  return loan;
}

export async function checkoutLoan(loanId: string, operatorId: string): Promise<Record<string, unknown>> {
  try {
    await db.query('CALL checkout_loan($1, $2)', [loanId, operatorId]);
  } catch (err) {
    const anyErr = err as { message?: string };
    if (anyErr.message?.includes('not in approved status') || anyErr.message?.includes('Insufficient stock')) {
      throw new AppError(anyErr.message, 409);
    }
    throw err;
  }
  const { rows } = await db.query<Record<string, unknown>>('SELECT * FROM loans WHERE id = $1', [loanId]);
  return rows[0];
}

export async function initiateReturn(
  loanId: string,
  coachId: string,
  coachName: string,
  clubId: string
): Promise<{ message: string }> {
  const { rows } = await db.query<Record<string, unknown>>(
    'SELECT * FROM loans WHERE id = $1 AND club_id = $2 AND coach_id = $3 AND status = $4',
    [loanId, clubId, coachId, 'checked_out']
  );
  if (!rows.length) throw new AppError('Active loan not found', 404);
  const loan = rows[0];

  await notificationService.notifyClubRoles(
    clubId, ['asset_manager', 'club_admin'], 'return_initiated',
    'Return Initiated',
    `${coachName} is returning items for loan #${String(loan.id).slice(0, 8)}`,
    { loan_id: loan.id }
  );
  return { message: 'Return initiated; awaiting manager confirmation' };
}

export async function confirmReturn(
  loanId: string,
  operatorId: string,
  clubId: string,
  condition: string,
  notes?: string
): Promise<Record<string, unknown>> {
  const validConditions = ['good', 'minor_damage', 'severe_damage'];
  if (!condition || !validConditions.includes(condition)) {
    throw new AppError('condition must be: good, minor_damage, or severe_damage', 400);
  }
  try {
    await db.query('CALL return_loan($1, $2, $3::return_condition, $4)', [loanId, operatorId, condition, notes ?? null]);
  } catch (err) {
    const anyErr = err as { message?: string };
    if (anyErr.message?.includes('not in checked_out status')) throw new AppError(anyErr.message, 409);
    throw err;
  }
  const { rows } = await db.query<Record<string, unknown>>('SELECT * FROM loans WHERE id = $1', [loanId]);
  const loan = rows[0];
  await notificationService.notifyUser(
    clubId, String(loan.coach_id), 'return_initiated',
    'Return Confirmed', 'Your return has been confirmed.',
    { loan_id: loan.id, condition }
  );
  return loan;
}
