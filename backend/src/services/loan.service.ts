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
              u.name  AS coach_name,
              cb.name AS created_by_name,
              ap.name AS approved_by_name
       FROM loans l
       JOIN  assets a  ON a.id  = l.asset_id
       JOIN  users  u  ON u.id  = l.coach_id
       LEFT JOIN users cb ON cb.id = l.created_by
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
  requesterId: string,
  requesterRole: string,
  { asset_id, quantity = 1, reason, due_date, coach_id }: {
    asset_id?: string;
    quantity?: number | string;
    reason?: string;
    due_date?: string;
    coach_id?: string;
  }
): Promise<Record<string, unknown>> {
  if (!asset_id || !due_date) throw new AppError('asset_id and due_date are required', 400);
  if (new Date(due_date) <= new Date()) throw new AppError('due_date must be a future date', 400);

  // Determine who is the borrower
  let coachId: string;
  if (requesterRole === 'coach') {
    coachId = requesterId;
  } else {
    if (!coach_id) throw new AppError('coach_id is required', 400);
    coachId = coach_id;
  }

  // Verify borrower belongs to this club
  const { rows: coachRows } = await db.query<{ name: string }>(
    'SELECT name FROM users WHERE id = $1 AND club_id = $2 AND is_active = true',
    [coachId, clubId]
  );
  if (!coachRows.length) throw new AppError('Borrower not found in this club', 404);
  const coachName = coachRows[0].name;

  const { rows: assetRows } = await db.query<Record<string, unknown>>(
    'SELECT * FROM assets WHERE id = $1 AND club_id = $2 AND is_active = true',
    [asset_id, clubId]
  );
  if (!assetRows.length) throw new AppError('Asset not found', 404);
  const asset = assetRows[0];

  if (Number(asset.available_quantity) < Number(quantity)) throw new AppError('Insufficient available quantity', 409);

  const { rows } = await db.query<Record<string, unknown>>(
    `INSERT INTO loans (club_id, asset_id, coach_id, created_by, quantity, reason, status, due_date)
     VALUES ($1,$2,$3,$4,$5,$6,'pending',$7) RETURNING *`,
    [clubId, asset_id, coachId, requesterId, Number(quantity), reason ?? null, due_date]
  );
  const loan = rows[0];

  notificationService.notifyClubRoles(
    clubId, ['asset_manager', 'club_admin'], 'loan_request',
    'New Loan Request',
    `${coachName} is requesting ${quantity}x "${String(asset.name)}"`,
    { loan_id: loan.id, asset_id, coach_id: coachId }
  ).catch(() => {});

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
            a.name  AS asset_name, a.image_url AS asset_image,
            u.name  AS coach_name, u.email AS coach_email,
            cb.name AS created_by_name,
            ap.name AS approved_by_name,
            co.name AS checkout_by_name,
            rc.name AS return_confirmed_by_name
     FROM loans l
     JOIN  assets a  ON a.id  = l.asset_id
     JOIN  users  u  ON u.id  = l.coach_id
     LEFT JOIN users cb ON cb.id = l.created_by
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
  notificationService.notifyUser(
    clubId, String(loan.coach_id), 'loan_approved',
    'Loan Request Approved', 'Your loan request has been approved. Please confirm receipt when you pick up the items.',
    { loan_id: loan.id }
  ).catch(() => {});
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
  notificationService.notifyUser(
    clubId, String(loan.coach_id), 'loan_rejected', 'Loan Request Rejected', body, { loan_id: loan.id }
  ).catch(() => {});
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

  notificationService.notifyClubRoles(
    clubId, ['asset_manager', 'club_admin'], 'return_initiated',
    'Return Initiated',
    `${coachName} is returning items for loan #${String(loan.id).slice(0, 8)}`,
    { loan_id: loan.id }
  ).catch(() => {});
  return { message: 'Return initiated; awaiting manager confirmation' };
}

export async function confirmReturn(
  loanId: string,
  operatorId: string,
  clubId: string,
  condition: string,
  returnedQuantity: number,
  notes?: string
): Promise<Record<string, unknown>> {
  const validConditions = ['good', 'minor_damage', 'severe_damage'];
  if (!condition || !validConditions.includes(condition)) {
    throw new AppError('condition must be: good, minor_damage, or severe_damage', 400);
  }

  const { rows: loanRows } = await db.query<Record<string, unknown>>(
    'SELECT * FROM loans WHERE id = $1 AND club_id = $2 AND status = $3',
    [loanId, clubId, 'checked_out']
  );
  if (!loanRows.length) throw new AppError('Loan is not in checked_out status', 409);
  const loan = loanRows[0];

  const totalQty = Number(loan.quantity);
  const retQty = Number(returnedQuantity);
  if (retQty < 1 || retQty > totalQty) {
    throw new AppError(`returned_quantity must be between 1 and ${totalQty}`, 400);
  }

  const isPartial = retQty < totalQty;

  if (!isPartial) {
    // Full return — use stored procedure
    try {
      await db.query('CALL return_loan($1, $2, $3::return_condition, $4)', [loanId, operatorId, condition, notes ?? null]);
    } catch (err) {
      const anyErr = err as { message?: string };
      if (anyErr.message?.includes('not in checked_out status')) throw new AppError(anyErr.message, 409);
      throw err;
    }
  } else {
    // Partial return — manual transaction
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: assetRows } = await client.query<{ available_quantity: number }>(
        'SELECT available_quantity FROM assets WHERE id = $1',
        [loan.asset_id]
      );
      const beforeQty = assetRows[0].available_quantity;

      // Mark original loan as returned (for the returned portion)
      await client.query(
        `UPDATE loans SET
           status = 'returned',
           return_confirmed_by = $1,
           returned_at = NOW(),
           return_condition = $2::return_condition,
           return_notes = $3,
           quantity = $4
         WHERE id = $5`,
        [operatorId, condition,
          `Partial return: ${retQty} of ${totalQty} returned. ${notes ?? ''}`.trim(),
          retQty, loanId]
      );

      // Restore returned quantity (skip if severe damage)
      const restoreQty = condition !== 'severe_damage' ? retQty : 0;
      if (restoreQty > 0) {
        await client.query(
          'UPDATE assets SET available_quantity = available_quantity + $1 WHERE id = $2',
          [restoreQty, loan.asset_id]
        );
      }

      // Stock movement for returned portion
      await client.query(
        `INSERT INTO stock_movements
           (club_id, asset_id, loan_id, operator_id, type, quantity_delta, quantity_before, quantity_after, notes)
         VALUES ($1,$2,$3,$4,'loan_return',$5,$6,$7,$8)`,
        [clubId, loan.asset_id, loanId, operatorId,
          restoreQty, beforeQty, beforeQty + restoreQty,
          `Partial return: ${retQty} of ${totalQty}`]
      );

      // New loan for remaining quantity
      const remaining = totalQty - retQty;
      await client.query(
        `INSERT INTO loans
           (club_id, asset_id, coach_id, approved_by, checkout_by,
            quantity, reason, status, due_date, checked_out_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'checked_out',$8,NOW())`,
        [clubId, loan.asset_id, loan.coach_id, loan.approved_by,
          loan.checkout_by, remaining, loan.reason, loan.due_date]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  const { rows } = await db.query<Record<string, unknown>>('SELECT * FROM loans WHERE id = $1', [loanId]);
  const returned = rows[0];

  notificationService.notifyUser(
    clubId, String(loan.coach_id), 'return_initiated',
    'Return Confirmed',
    isPartial
      ? `Partial return confirmed: ${retQty} of ${totalQty} items returned.`
      : 'Your return has been confirmed.',
    { loan_id: loanId, condition }
  ).catch(() => {});
  return returned;
}

export async function updateLoan(
  loanId: string,
  clubId: string,
  userId: string,
  role: string,
  { asset_id, quantity, due_date, reason, coach_id }: {
    asset_id?: string;
    quantity?: number | string;
    due_date?: string;
    reason?: string;
    coach_id?: string;
  }
): Promise<Record<string, unknown>> {
  // Fetch existing loan
  const { rows: existing } = await db.query<Record<string, unknown>>(
    'SELECT * FROM loans WHERE id = $1 AND club_id = $2',
    [loanId, clubId]
  );
  if (!existing.length) throw new AppError('Loan not found', 404);
  const loan = existing[0];

  if (loan.status !== 'pending') throw new AppError('Only pending loans can be edited', 409);

  // Coach may only edit loans where they are the borrower
  if (role === 'coach' && loan.coach_id !== userId) {
    throw new AppError('Access denied', 403);
  }

  // Coaches cannot reassign the borrower
  if (role === 'coach' && coach_id && coach_id !== loan.coach_id) {
    throw new AppError('Coaches cannot change the borrower', 403);
  }

  const updates: string[] = [];
  const params: unknown[] = [];

  if (asset_id !== undefined) {
    const { rows: assetRows } = await db.query<{ available_quantity: number }>(
      'SELECT available_quantity FROM assets WHERE id = $1 AND club_id = $2 AND is_active = true',
      [asset_id, clubId]
    );
    if (!assetRows.length) throw new AppError('Asset not found', 404);
    updates.push(`asset_id = $${params.push(asset_id)}`);
  }

  if (quantity !== undefined) {
    if (Number(quantity) < 1) throw new AppError('quantity must be at least 1', 400);
    updates.push(`quantity = $${params.push(Number(quantity))}`);
  }

  if (due_date !== undefined) {
    if (new Date(due_date) <= new Date()) throw new AppError('due_date must be a future date', 400);
    updates.push(`due_date = $${params.push(due_date)}`);
  }

  if (reason !== undefined) {
    updates.push(`reason = $${params.push(reason)}`);
  }

  if (coach_id !== undefined) {
    const { rows: coachRows } = await db.query(
      'SELECT id FROM users WHERE id = $1 AND club_id = $2 AND is_active = true',
      [coach_id, clubId]
    );
    if (!coachRows.length) throw new AppError('Borrower not found in this club', 404);
    updates.push(`coach_id = $${params.push(coach_id)}`);
  }

  if (!updates.length) throw new AppError('No fields to update', 400);

  updates.push(`updated_at = NOW()`);
  params.push(loanId);

  const { rows } = await db.query<Record<string, unknown>>(
    `UPDATE loans SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  return rows[0];
}
