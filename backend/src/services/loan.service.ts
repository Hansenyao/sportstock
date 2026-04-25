import * as db from '../db';
import * as notificationService from './notification.service';
import AppError from '../utils/AppError';
import type { PaginatedResult } from '../types';

// ── Types ────────────────────────────────────────────────────────────────────

interface LoanItemInput {
  asset_id: string;
  quantity: number;
}

interface ReturnItemInput {
  loan_item_id: string;
  good_quantity: number;
  minor_damage_quantity: number;
  write_off_quantity: number;
  lost_quantity: number;
  notes?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const LOAN_SELECT = `
  SELECT l.*,
         u.name  AS coach_name,  u.email AS coach_email,
         cb.name AS created_by_name,
         ap.name AS approved_by_name,
         co.name AS checkout_by_name,
         rc.name AS return_confirmed_by_name
  FROM  loans l
  JOIN  users u  ON u.id  = l.coach_id
  LEFT JOIN users cb ON cb.id = l.created_by
  LEFT JOIN users ap ON ap.id = l.approved_by
  LEFT JOIN users co ON co.id = l.checkout_by
  LEFT JOIN users rc ON rc.id = l.return_confirmed_by
`;

const ITEM_SELECT = `
  SELECT li.*,
         COALESCE(li.good_quantity, 0) + COALESCE(li.minor_damage_quantity, 0) AS returned_quantity,
         a.name      AS asset_name,
         a.image_url AS asset_image,
         a.brand, a.model, a.size, a.asset_tag,
         a.available_quantity AS asset_available_quantity
  FROM  loan_items li
  JOIN  assets a ON a.id = li.asset_id
`;

async function fetchItems(loanId: string): Promise<Record<string, unknown>[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `${ITEM_SELECT} WHERE li.loan_id = $1 ORDER BY li.created_at`,
    [loanId]
  );
  return rows;
}

// ── List ─────────────────────────────────────────────────────────────────────

export async function listLoans(
  clubId: string,
  userId: string,
  role: string,
  { status, coach_id, from_date, to_date, page = 1, limit = 20 }: {
    status?: string;
    coach_id?: string;
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
  if (from_date) conditions.push(`l.created_at >= $${params.push(from_date)}`);
  if (to_date)   conditions.push(`l.created_at < $${params.push(to_date)}`);

  const where = conditions.join(' AND ');

  const [{ rows: loans }, { rows: countRows }] = await Promise.all([
    db.query<Record<string, unknown>>(
      `${LOAN_SELECT} WHERE ${where} ORDER BY l.created_at DESC
       LIMIT $${params.push(Number(limit))} OFFSET $${params.push(offset)}`,
      params
    ),
    db.query<{ count: string }>(`SELECT COUNT(*) FROM loans l WHERE ${where}`, params.slice(0, -2)),
  ]);

  // Attach items to each loan
  if (loans.length) {
    const loanIds = loans.map(l => l.id as string);
    const { rows: allItems } = await db.query<Record<string, unknown>>(
      `${ITEM_SELECT} WHERE li.loan_id = ANY($1::uuid[]) ORDER BY li.created_at`,
      [loanIds]
    );
    const itemsByLoan = new Map<string, Record<string, unknown>[]>();
    for (const item of allItems) {
      const lid = item.loan_id as string;
      if (!itemsByLoan.has(lid)) itemsByLoan.set(lid, []);
      itemsByLoan.get(lid)!.push(item);
    }
    for (const loan of loans) {
      loan.items = itemsByLoan.get(loan.id as string) ?? [];
    }
  }

  return { data: loans, total: parseInt(countRows[0].count), page: Number(page), limit: Number(limit) };
}

// ── Get single ───────────────────────────────────────────────────────────────

export async function getLoan(
  loanId: string,
  clubId: string,
  userId: string,
  role: string
): Promise<Record<string, unknown>> {
  const { rows } = await db.query<Record<string, unknown>>(
    `${LOAN_SELECT} WHERE l.id = $1 AND l.club_id = $2`,
    [loanId, clubId]
  );
  if (!rows.length) throw new AppError('Loan not found', 404);
  const loan = rows[0];
  if (role === 'coach' && loan.coach_id !== userId) throw new AppError('Access denied', 403);
  loan.items = await fetchItems(loanId);
  return loan;
}

// ── Create ───────────────────────────────────────────────────────────────────

export async function createLoan(
  clubId: string,
  requesterId: string,
  requesterRole: string,
  { items, due_date, reason, coach_id }: {
    items?: LoanItemInput[];
    due_date?: string;
    reason?: string;
    coach_id?: string;
  }
): Promise<Record<string, unknown>> {
  if (!items?.length) throw new AppError('At least one item is required', 400);
  if (!due_date)      throw new AppError('due_date is required', 400);
  if (new Date(due_date) <= new Date()) throw new AppError('due_date must be a future date', 400);

  // Determine borrower
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

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Validate all items and check availability
    const assetNames: string[] = [];
    for (const item of items) {
      const { rows: assetRows } = await client.query<Record<string, unknown>>(
        'SELECT name, available_quantity FROM assets WHERE id = $1 AND club_id = $2 AND is_active = true',
        [item.asset_id, clubId]
      );
      if (!assetRows.length) throw new AppError(`Asset ${item.asset_id} not found`, 404);
      const asset = assetRows[0];
      if (Number(asset.available_quantity) < item.quantity) {
        throw new AppError(
          `Insufficient quantity for "${String(asset.name)}": requested ${item.quantity}, available ${asset.available_quantity}`,
          409
        );
      }
      assetNames.push(String(asset.name));
    }

    // Insert loan
    const { rows: loanRows } = await client.query<Record<string, unknown>>(
      `INSERT INTO loans (club_id, coach_id, created_by, reason, status, due_date)
       VALUES ($1,$2,$3,$4,'pending',$5) RETURNING *`,
      [clubId, coachId, requesterId, reason ?? null, due_date]
    );
    const loan = loanRows[0];

    // Insert loan items
    for (const item of items) {
      await client.query(
        'INSERT INTO loan_items (loan_id, asset_id, quantity) VALUES ($1,$2,$3)',
        [loan.id, item.asset_id, item.quantity]
      );
    }

    await client.query('COMMIT');

    notificationService.notifyClubRoles(
      clubId, ['asset_manager', 'club_admin'], 'loan_request',
      'New Loan Request',
      `${coachName} is requesting ${items.length} item(s)`,
      { loan_id: loan.id, coach_id: coachId }
    ).catch(() => {});

    loan.items = await fetchItems(loan.id as string);
    return loan;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Delete (pending only, creator only) ─────────────────────────────────────

export async function deleteLoan(
  loanId: string,
  clubId: string,
  userId: string,
  role: string
): Promise<void> {
  const { rows } = await db.query<Record<string, unknown>>(
    'SELECT * FROM loans WHERE id = $1 AND club_id = $2',
    [loanId, clubId]
  );
  if (!rows.length) throw new AppError('Loan not found', 404);
  const loan = rows[0];

  if (loan.status !== 'pending') throw new AppError('Only pending loans can be deleted', 409);

  // Only the creator can delete (coaches or managers who submitted the loan)
  if (loan.created_by !== userId && role !== 'super_admin') {
    throw new AppError('Only the creator can delete this loan', 403);
  }

  await db.query('DELETE FROM loans WHERE id = $1', [loanId]);
}

// ── Update (pending only) ────────────────────────────────────────────────────

export async function updateLoan(
  loanId: string,
  clubId: string,
  userId: string,
  role: string,
  { items, due_date, reason, coach_id }: {
    items?: LoanItemInput[];
    due_date?: string;
    reason?: string;
    coach_id?: string;
  }
): Promise<Record<string, unknown>> {
  const { rows: existing } = await db.query<Record<string, unknown>>(
    'SELECT * FROM loans WHERE id = $1 AND club_id = $2',
    [loanId, clubId]
  );
  if (!existing.length) throw new AppError('Loan not found', 404);
  const loan = existing[0];

  if (loan.status !== 'pending') throw new AppError('Only pending loans can be edited', 409);
  if (role === 'coach' && loan.coach_id !== userId) throw new AppError('Access denied', 403);
  if (role === 'coach' && coach_id && coach_id !== loan.coach_id) {
    throw new AppError('Coaches cannot change the borrower', 403);
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Update loan header fields
    const updates: string[] = [];
    const params: unknown[] = [];

    if (due_date !== undefined) {
      if (new Date(due_date) <= new Date()) throw new AppError('due_date must be a future date', 400);
      updates.push(`due_date = $${params.push(due_date)}`);
    }
    if (reason !== undefined) updates.push(`reason = $${params.push(reason)}`);
    if (coach_id !== undefined) {
      const { rows } = await client.query(
        'SELECT id FROM users WHERE id = $1 AND club_id = $2 AND is_active = true',
        [coach_id, clubId]
      );
      if (!rows.length) throw new AppError('Borrower not found in this club', 404);
      updates.push(`coach_id = $${params.push(coach_id)}`);
    }

    if (updates.length) {
      updates.push('updated_at = NOW()');
      params.push(loanId);
      await client.query(
        `UPDATE loans SET ${updates.join(', ')} WHERE id = $${params.length}`,
        params
      );
    }

    // Replace items if provided
    if (items !== undefined) {
      if (!items.length) throw new AppError('At least one item is required', 400);

      // Validate availability for each new item
      for (const item of items) {
        const { rows: assetRows } = await client.query<Record<string, unknown>>(
          'SELECT name, available_quantity FROM assets WHERE id = $1 AND club_id = $2 AND is_active = true',
          [item.asset_id, clubId]
        );
        if (!assetRows.length) throw new AppError(`Asset ${item.asset_id} not found`, 404);
        if (Number(assetRows[0].available_quantity) < item.quantity) {
          throw new AppError(
            `Insufficient quantity for "${String(assetRows[0].name)}": requested ${item.quantity}, available ${assetRows[0].available_quantity}`,
            409
          );
        }
      }

      await client.query('DELETE FROM loan_items WHERE loan_id = $1', [loanId]);
      for (const item of items) {
        await client.query(
          'INSERT INTO loan_items (loan_id, asset_id, quantity) VALUES ($1,$2,$3)',
          [loanId, item.asset_id, item.quantity]
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return getLoan(loanId, clubId, userId, role);
}

// ── Approve ──────────────────────────────────────────────────────────────────

export async function approveLoan(
  loanId: string,
  approverId: string,
  clubId: string
): Promise<Record<string, unknown>> {
  try {
    await db.query('CALL approve_loan($1, $2)', [loanId, approverId]);
  } catch (err) {
    const anyErr = err as { message?: string };
    if (anyErr.message?.includes('not in pending status')) throw new AppError(anyErr.message, 409);
    throw err;
  }
  const loan = await getLoan(loanId, clubId, approverId, 'club_admin');
  notificationService.notifyUser(
    clubId, String(loan.coach_id), 'loan_approved',
    'Loan Request Approved',
    'Your loan request has been approved. Please confirm receipt when you pick up the items.',
    { loan_id: loan.id }
  ).catch(() => {});
  return loan;
}

// ── Reject ───────────────────────────────────────────────────────────────────

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
  const loan = await getLoan(loanId, clubId, approverId, 'club_admin');
  const body = reason ? `Your loan request was rejected: ${reason}` : 'Your loan request was rejected.';
  notificationService.notifyUser(
    clubId, String(loan.coach_id), 'loan_rejected', 'Loan Request Rejected', body, { loan_id: loan.id }
  ).catch(() => {});
  return loan;
}

// ── Checkout ─────────────────────────────────────────────────────────────────

export async function checkoutLoan(
  loanId: string,
  operatorId: string,
  clubId: string
): Promise<Record<string, unknown>> {
  const { rows } = await db.query<Record<string, unknown>>(
    'SELECT coach_id FROM loans WHERE id = $1 AND club_id = $2',
    [loanId, clubId]
  );
  if (!rows.length) throw new AppError('Loan not found', 404);
  if (rows[0].coach_id !== operatorId) throw new AppError('Only the borrower can confirm receipt', 403);

  try {
    await db.query('CALL checkout_loan($1, $2)', [loanId, operatorId]);
  } catch (err) {
    const anyErr = err as { message?: string };
    if (anyErr.message?.includes('not in approved status') || anyErr.message?.includes('Insufficient stock')) {
      throw new AppError(anyErr.message, 409);
    }
    throw err;
  }
  return getLoan(loanId, clubId, operatorId, 'club_admin');
}

// ── Confirm Return ───────────────────────────────────────────────────────────

function buildReturnNote(goodQty: number, minorQty: number, writeOffQty: number, lostQty: number): string {
  const parts: string[] = [];
  if (goodQty > 0)      parts.push(`${goodQty} good`);
  if (minorQty > 0)     parts.push(`${minorQty} minor damage`);
  if (writeOffQty > 0)  parts.push(`${writeOffQty} written off`);
  if (lostQty > 0)      parts.push(`${lostQty} lost`);
  return parts.join(', ');
}

export async function confirmReturn(
  loanId: string,
  operatorId: string,
  clubId: string,
  returnItems: ReturnItemInput[],
  loanNotes?: string
): Promise<Record<string, unknown>> {
  // Fetch and validate loan
  const { rows: loanRows } = await db.query<Record<string, unknown>>(
    'SELECT * FROM loans WHERE id = $1 AND club_id = $2 AND status = $3',
    [loanId, clubId, 'checked_out']
  );
  if (!loanRows.length) throw new AppError('Loan is not in checked_out status', 409);
  const loan = loanRows[0];

  // Fetch existing loan items
  const { rows: existingItems } = await db.query<Record<string, unknown>>(
    'SELECT li.*, a.name AS asset_name FROM loan_items li JOIN assets a ON a.id = li.asset_id WHERE li.loan_id = $1',
    [loanId]
  );

  // Validate all loan_item_ids and quantity sums
  const itemMap = new Map(existingItems.map(i => [i.id as string, i]));
  for (const ri of returnItems) {
    if (!itemMap.has(ri.loan_item_id)) {
      throw new AppError(`loan_item_id ${ri.loan_item_id} not found in this loan`, 404);
    }
    const item = itemMap.get(ri.loan_item_id)!;
    const originalQty = Number(item.quantity);
    const total = ri.good_quantity + ri.minor_damage_quantity + ri.write_off_quantity + ri.lost_quantity;
    if (total !== originalQty) {
      throw new AppError(
        `Quantities for "${String(item.asset_name)}" must sum to ${originalQty} (got ${total})`,
        400
      );
    }
    if ([ri.good_quantity, ri.minor_damage_quantity, ri.write_off_quantity, ri.lost_quantity].some(n => n < 0)) {
      throw new AppError(`All return quantities must be non-negative for "${String(item.asset_name)}"`, 400);
    }
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    for (const ri of returnItems) {
      const item = itemMap.get(ri.loan_item_id)!;
      const returnedQty = ri.good_quantity + ri.minor_damage_quantity;
      const autoNote = buildReturnNote(ri.good_quantity, ri.minor_damage_quantity, ri.write_off_quantity, ri.lost_quantity);
      const itemNote = ri.notes ? `${autoNote}; ${ri.notes}` : autoNote;

      // Update loan_item with 4-bucket breakdown
      await client.query(
        `UPDATE loan_items
         SET good_quantity = $1, minor_damage_quantity = $2, write_off_quantity = $3,
             lost_quantity = $4, return_notes = $5, updated_at = NOW()
         WHERE id = $6`,
        [ri.good_quantity, ri.minor_damage_quantity, ri.write_off_quantity, ri.lost_quantity,
          itemNote, ri.loan_item_id]
      );

      const { rows: assetRows } = await client.query<{ available_quantity: number; total_quantity: number }>(
        'SELECT available_quantity, total_quantity FROM assets WHERE id = $1',
        [item.asset_id]
      );
      const { available_quantity: availBefore } = assetRows[0];

      // Restore good + minor_damage back to available stock
      if (returnedQty > 0) {
        await client.query(
          `UPDATE assets SET available_quantity = available_quantity + $1,
           status = CASE WHEN available_quantity + $1 > 0 THEN 'available'::asset_status ELSE status END
           WHERE id = $2`,
          [returnedQty, item.asset_id]
        );
        await client.query(
          `INSERT INTO stock_movements
             (club_id, asset_id, loan_id, loan_item_id, operator_id, type,
              quantity_delta, quantity_before, quantity_after, notes)
           VALUES ($1,$2,$3,$4,$5,'loan_return',$6,$7,$8,$9)`,
          [clubId, item.asset_id, loanId, ri.loan_item_id, operatorId,
            returnedQty, availBefore, availBefore + returnedQty, itemNote]
        );
      }

      // Write-off: deduct from total_quantity (items already not in available)
      if (ri.write_off_quantity > 0) {
        await client.query(
          `UPDATE assets SET total_quantity = total_quantity - $1,
           status = CASE WHEN total_quantity - $1 <= 0 THEN 'retired'::asset_status ELSE status END
           WHERE id = $2`,
          [ri.write_off_quantity, item.asset_id]
        );
        const availAfterReturn = availBefore + returnedQty;
        await client.query(
          `INSERT INTO stock_movements
             (club_id, asset_id, loan_id, loan_item_id, operator_id, type,
              quantity_delta, quantity_before, quantity_after, notes)
           VALUES ($1,$2,$3,$4,$5,'write_off',$6,$7,$8,$9)`,
          [clubId, item.asset_id, loanId, ri.loan_item_id, operatorId,
            -ri.write_off_quantity, availAfterReturn, availAfterReturn,
            `Write-off on loan return: ${ri.write_off_quantity} item(s)`]
        );
        await client.query(
          `INSERT INTO write_off_orders (club_id, asset_id, quantity, reason, source, loan_item_id, created_by, notes)
           VALUES ($1,$2,$3,$4,'loan_return',$5,$6,$7)`,
          [clubId, item.asset_id, ri.write_off_quantity,
            `Write-off from loan return`,
            ri.loan_item_id, operatorId, itemNote]
        );
      }

      // Lost: deduct from total_quantity, use loan_lost source for future recovery traceability
      if (ri.lost_quantity > 0) {
        await client.query(
          `UPDATE assets SET total_quantity = total_quantity - $1,
           status = CASE WHEN total_quantity - $1 <= 0 THEN 'retired'::asset_status ELSE status END
           WHERE id = $2`,
          [ri.lost_quantity, item.asset_id]
        );
        const availAfterReturn = availBefore + returnedQty;
        await client.query(
          `INSERT INTO stock_movements
             (club_id, asset_id, loan_id, loan_item_id, operator_id, type,
              quantity_delta, quantity_before, quantity_after, notes)
           VALUES ($1,$2,$3,$4,$5,'write_off',$6,$7,$8,$9)`,
          [clubId, item.asset_id, loanId, ri.loan_item_id, operatorId,
            -ri.lost_quantity, availAfterReturn, availAfterReturn,
            `Lost item recorded from loan return: ${ri.lost_quantity} item(s)`]
        );
        await client.query(
          `INSERT INTO write_off_orders (club_id, asset_id, quantity, reason, source, loan_item_id, created_by, notes)
           VALUES ($1,$2,$3,$4,'loan_lost',$5,$6,$7)`,
          [clubId, item.asset_id, ri.lost_quantity,
            `Lost item from loan return`,
            ri.loan_item_id, operatorId, itemNote]
        );
      }
    }

    // Mark loan as returned
    await client.query(
      `UPDATE loans
       SET status = 'returned', return_confirmed_by = $1, returned_at = NOW(),
           return_notes = $2, updated_at = NOW()
       WHERE id = $3`,
      [operatorId, loanNotes ?? null, loanId]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  notificationService.notifyUser(
    clubId, String(loan.coach_id), 'return_initiated',
    'Return Confirmed', 'Your loan return has been confirmed.',
    { loan_id: loanId }
  ).catch(() => {});

  return getLoan(loanId, clubId, operatorId, 'club_admin');
}
