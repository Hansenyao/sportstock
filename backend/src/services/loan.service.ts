import * as db from '../db';
import * as notificationService from './notification.service';
import AppError from '../utils/AppError';
import type { PaginatedResult } from '../types';

// ── Types ────────────────────────────────────────────────────────────────────

interface LoanItemInput {
  asset_type_id: string;
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
         rc.name AS return_confirmed_by_name,
         t.name  AS team_name
  FROM  loans l
  JOIN  users u  ON u.id  = l.coach_id
  LEFT JOIN users cb ON cb.id = l.created_by
  LEFT JOIN users ap ON ap.id = l.approved_by
  LEFT JOIN users co ON co.id = l.checkout_by
  LEFT JOIN users rc ON rc.id = l.return_confirmed_by
  LEFT JOIN teams t  ON t.id  = l.team_id
`;

const ITEM_SELECT = `
  SELECT li.*,
         COALESCE(li.good_quantity, 0) + COALESCE(li.minor_damage_quantity, 0) AS returned_quantity,
         an.name      AS asset_name,
         at.image_url AS asset_image,
         at.brand, at.model, at.size
  FROM  loan_items li
  JOIN  asset_types at ON at.id = li.asset_type_id
  JOIN  asset_names an ON an.id = at.asset_name_id
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
  { status, overdue, search, coach_id, team_id, from_date, to_date, page = 1, limit = 20 }: {
    status?: string;
    overdue?: string;
    search?: string;
    coach_id?: string;
    team_id?: string;
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
  } else {
    if (coach_id) conditions.push(`l.coach_id = $${params.push(coach_id)}`);
    if (team_id)  conditions.push(`l.team_id  = $${params.push(team_id)}`);
  }
  if (overdue) {
    conditions.push(`l.status = 'checked_out'`);
    conditions.push(`l.due_date < CURRENT_DATE`);
  } else if (status) {
    conditions.push(`l.status = $${params.push(status)}`);
  }
  if (from_date) conditions.push(`l.created_at >= $${params.push(from_date)}`);
  if (to_date)   conditions.push(`l.created_at < $${params.push(to_date)}`);
  if (search) {
    const kw = `%${search}%`;
    const idx = params.push(kw);
    conditions.push(`(
      EXISTS (SELECT 1 FROM users u2 WHERE u2.id = l.coach_id AND u2.name ILIKE $${idx})
      OR EXISTS (
        SELECT 1 FROM loan_items li2
        JOIN asset_types at2 ON at2.id = li2.asset_type_id
        JOIN asset_names an2 ON an2.id = at2.asset_name_id
        WHERE li2.loan_id = l.id AND an2.name ILIKE $${idx}
      )
    )`);
  }

  const where = conditions.join(' AND ');

  const [{ rows: loans }, { rows: countRows }] = await Promise.all([
    db.query<Record<string, unknown>>(
      `${LOAN_SELECT} WHERE ${where} ORDER BY l.created_at DESC
       LIMIT $${params.push(Number(limit))} OFFSET $${params.push(offset)}`,
      params
    ),
    db.query<{ count: string }>(`SELECT COUNT(*) FROM loans l WHERE ${where}`, params.slice(0, -2)),
  ]);

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
  { items, due_date, reason, coach_id, team_id }: {
    items?: LoanItemInput[];
    due_date?: string;
    reason?: string;
    coach_id?: string;
    team_id?: string;
  }
): Promise<Record<string, unknown>> {
  if (!items?.length) throw new AppError('At least one item is required', 400);
  if (!due_date)      throw new AppError('due_date is required', 400);
  if (new Date(due_date) <= new Date()) throw new AppError('due_date must be a future date', 400);

  let coachId: string;
  if (requesterRole === 'coach') {
    coachId = requesterId;
  } else {
    if (!coach_id) throw new AppError('coach_id is required', 400);
    coachId = coach_id;
  }

  const { rows: coachRows } = await db.query<{ name: string }>(
    'SELECT name FROM users WHERE id = $1 AND club_id = $2 AND is_active = true',
    [coachId, clubId]
  );
  if (!coachRows.length) throw new AppError('Borrower not found in this club', 404);
  const coachName = coachRows[0].name;

  if (team_id) {
    const { rows: teamRows } = await db.query<{ id: string }>(
      `SELECT t.id FROM teams t
       JOIN team_members tm ON tm.team_id = t.id
       WHERE t.id = $1 AND t.club_id = $2 AND tm.user_id = $3`,
      [team_id, clubId, coachId]
    );
    if (!teamRows.length) throw new AppError('Coach is not a member of this team', 400);
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const assetNames: string[] = [];
    for (const item of items) {
      const { rows: typeRows } = await client.query<{ available_quantity: string; name: string }>(
        `SELECT COALESCE(SUM(ab.available_quantity), 0) AS available_quantity,
                an.name
         FROM asset_types at
         JOIN asset_names an ON an.id = at.asset_name_id
         LEFT JOIN asset_batches ab ON ab.asset_type_id = at.id AND ab.status != 'retired'
         WHERE at.id = $1 AND at.club_id = $2 AND at.is_active = true
         GROUP BY an.name`,
        [item.asset_type_id, clubId]
      );
      if (!typeRows.length) throw new AppError(`Asset type ${item.asset_type_id} not found`, 404);
      if (Number(typeRows[0].available_quantity) < item.quantity) {
        throw new AppError(
          `Insufficient quantity for "${typeRows[0].name}": requested ${item.quantity}, available ${typeRows[0].available_quantity}`,
          409
        );
      }
      assetNames.push(typeRows[0].name);
    }

    const { rows: loanRows } = await client.query<Record<string, unknown>>(
      `INSERT INTO loans (club_id, coach_id, team_id, created_by, reason, status, due_date)
       VALUES ($1,$2,$3,$4,$5,'pending',$6) RETURNING *`,
      [clubId, coachId, team_id ?? null, requesterId, reason ?? null, due_date]
    );
    const loan = loanRows[0];

    for (const item of items) {
      await client.query(
        'INSERT INTO loan_items (loan_id, asset_type_id, quantity) VALUES ($1,$2,$3)',
        [loan.id, item.asset_type_id, item.quantity]
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
  { items, due_date, reason, coach_id, team_id }: {
    items?: LoanItemInput[];
    due_date?: string;
    reason?: string;
    coach_id?: string;
    team_id?: string | null;
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

    if (team_id !== undefined) {
      if (team_id === null) {
        updates.push(`team_id = $${params.push(null)}`);
      } else {
        const effectiveCoachId = coach_id ?? String(loan.coach_id);
        const { rows: teamRows } = await client.query<{ id: string }>(
          `SELECT t.id FROM teams t
           JOIN team_members tm ON tm.team_id = t.id
           WHERE t.id = $1 AND t.club_id = $2 AND tm.user_id = $3`,
          [team_id, clubId, effectiveCoachId]
        );
        if (!teamRows.length) throw new AppError('Coach is not a member of this team', 400);
        updates.push(`team_id = $${params.push(team_id)}`);
      }
    }

    if (updates.length) {
      updates.push('updated_at = NOW()');
      params.push(loanId);
      await client.query(
        `UPDATE loans SET ${updates.join(', ')} WHERE id = $${params.length}`,
        params
      );
    }

    if (items !== undefined) {
      if (!items.length) throw new AppError('At least one item is required', 400);

      for (const item of items) {
        const { rows: typeRows } = await client.query<{ available_quantity: string; name: string }>(
          `SELECT COALESCE(SUM(ab.available_quantity), 0) AS available_quantity,
                  an.name
           FROM asset_types at
           JOIN asset_names an ON an.id = at.asset_name_id
           LEFT JOIN asset_batches ab ON ab.asset_type_id = at.id AND ab.status != 'retired'
           WHERE at.id = $1 AND at.club_id = $2 AND at.is_active = true
           GROUP BY an.name`,
          [item.asset_type_id, clubId]
        );
        if (!typeRows.length) throw new AppError(`Asset type ${item.asset_type_id} not found`, 404);
        if (Number(typeRows[0].available_quantity) < item.quantity) {
          throw new AppError(
            `Insufficient quantity for "${typeRows[0].name}": requested ${item.quantity}, available ${typeRows[0].available_quantity}`,
            409
          );
        }
      }

      await client.query('DELETE FROM loan_items WHERE loan_id = $1', [loanId]);
      for (const item of items) {
        await client.query(
          'INSERT INTO loan_items (loan_id, asset_type_id, quantity) VALUES ($1,$2,$3)',
          [loanId, item.asset_type_id, item.quantity]
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
  const { rows: loanRows } = await db.query<Record<string, unknown>>(
    'SELECT * FROM loans WHERE id = $1 AND club_id = $2 AND status = $3',
    [loanId, clubId, 'checked_out']
  );
  if (!loanRows.length) throw new AppError('Loan is not in checked_out status', 409);
  const loan = loanRows[0];

  const { rows: existingItems } = await db.query<Record<string, unknown>>(
    `SELECT li.*, an.name AS asset_name
     FROM loan_items li
     JOIN asset_types at ON at.id = li.asset_type_id
     JOIN asset_names an ON an.id = at.asset_name_id
     WHERE li.loan_id = $1`,
    [loanId]
  );

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
      const nonReturnedQty = ri.write_off_quantity + ri.lost_quantity;
      const autoNote = buildReturnNote(ri.good_quantity, ri.minor_damage_quantity, ri.write_off_quantity, ri.lost_quantity);
      const itemNote = ri.notes ? `${autoNote}; ${ri.notes}` : autoNote;
      const assetTypeId = item.asset_type_id as string;

      await client.query(
        `UPDATE loan_items
         SET good_quantity = $1, minor_damage_quantity = $2, write_off_quantity = $3,
             lost_quantity = $4, return_notes = $5, updated_at = NOW()
         WHERE id = $6`,
        [ri.good_quantity, ri.minor_damage_quantity, ri.write_off_quantity, ri.lost_quantity,
          itemNote, ri.loan_item_id]
      );

      // Find which batches were deducted at checkout for this loan item
      const { rows: checkoutMovements } = await client.query<{ asset_batch_id: string; qty: number }>(
        `SELECT asset_batch_id, ABS(quantity_delta) AS qty
         FROM stock_movements
         WHERE loan_item_id = $1 AND type = 'loan_out'
         ORDER BY created_at ASC`,
        [ri.loan_item_id]
      );

      // Distribute returned and non-returned quantities back across checkout batches
      let remainingReturned = returnedQty;
      let remainingNonReturned = nonReturnedQty;

      for (const movement of checkoutMovements) {
        if (remainingReturned <= 0 && remainingNonReturned <= 0) break;
        const batchId = movement.asset_batch_id;
        const batchQty = Number(movement.qty);

        const batchReturned = Math.min(remainingReturned, batchQty);
        remainingReturned -= batchReturned;
        const batchNonReturned = Math.min(batchQty - batchReturned, remainingNonReturned);
        remainingNonReturned -= batchNonReturned;

        // Restore returned units to available_quantity
        if (batchReturned > 0) {
          const { rows: batchRows } = await client.query<{ available_quantity: number }>(
            'SELECT available_quantity FROM asset_batches WHERE id = $1',
            [batchId]
          );
          const availBefore = Number(batchRows[0].available_quantity);

          await client.query(
            `UPDATE asset_batches
             SET available_quantity = available_quantity + $1,
                 status = CASE WHEN status = 'on_loan' AND available_quantity + $1 > 0
                               THEN 'available'::asset_status
                               ELSE status END,
                 updated_at = NOW()
             WHERE id = $2`,
            [batchReturned, batchId]
          );
          await client.query(
            `INSERT INTO stock_movements
               (club_id, asset_batch_id, loan_id, loan_item_id, operator_id, type,
                quantity_delta, quantity_before, quantity_after, notes)
             VALUES ($1,$2,$3,$4,$5,'loan_return',$6,$7,$8,$9)`,
            [clubId, batchId, loanId, ri.loan_item_id, operatorId,
              batchReturned, availBefore, availBefore + batchReturned, itemNote]
          );
        }

        // Deduct non-returned from total_quantity (already removed from available at checkout)
        if (batchNonReturned > 0) {
          await client.query(
            `UPDATE asset_batches
             SET total_quantity = total_quantity - $1,
                 status = CASE WHEN total_quantity - $1 <= 0 THEN 'retired'::asset_status ELSE status END,
                 updated_at = NOW()
             WHERE id = $2`,
            [batchNonReturned, batchId]
          );
          await client.query(
            `INSERT INTO stock_movements
               (club_id, asset_batch_id, loan_id, loan_item_id, operator_id, type,
                quantity_delta, quantity_before, quantity_after, notes)
             VALUES ($1,$2,$3,$4,$5,'write_off',$6,$7,$7,$8)`,
            [clubId, batchId, loanId, ri.loan_item_id, operatorId,
              -batchNonReturned, 0,
              `Write-off/lost on loan return`]
          );
        }
      }

      // Create write_off_orders
      if (ri.write_off_quantity > 0) {
        await client.query(
          `INSERT INTO write_off_orders
             (club_id, asset_type_id, quantity, reason, source, loan_item_id, created_by, notes)
           VALUES ($1,$2,$3,'Write-off from loan return','loan_return',$4,$5,$6)`,
          [clubId, assetTypeId, ri.write_off_quantity, ri.loan_item_id, operatorId, itemNote]
        );
      }
      if (ri.lost_quantity > 0) {
        await client.query(
          `INSERT INTO write_off_orders
             (club_id, asset_type_id, quantity, reason, source, loan_item_id, created_by, notes)
           VALUES ($1,$2,$3,'Lost item from loan return','loan_lost',$4,$5,$6)`,
          [clubId, assetTypeId, ri.lost_quantity, ri.loan_item_id, operatorId, itemNote]
        );
      }
    }

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
